import { useRef, useMemo, useState, forwardRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, PerspectiveCamera, OrbitControls } from '@react-three/drei';
import { Physics, RigidBody, InstancedRigidBodies, RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';

const SAND_COUNT = 888;
const GRAVITY: [number, number, number] = [0, -9.8, 0];

// Reuse Geometries and Materials for performance
const glassMaterial = new THREE.MeshPhysicalMaterial({
  transmission: 1,
  roughness: 0.05,
  metalness: 0.05,
  thickness: 0.02,
  clearcoat: 1,
  clearcoatRoughness: 0.05,
  ior: 1.45,
  color: "#e0f7fa",
  transparent: true,
  opacity: 0.3,
  side: THREE.DoubleSide
});

const capMaterial = new THREE.MeshPhysicalMaterial({ color: "#333", metalness: 0.8, roughness: 0.2 });
const sandMaterial = new THREE.MeshPhysicalMaterial({ 
  color: "#FFD700", 
  metalness: 1.0,   // Full metallic for real gold
  roughness: 0.1,   // Smoother for better reflections
  reflectivity: 1.0,
  clearcoat: 1.0,   // Add a shiny outer layer
  clearcoatRoughness: 0.1,
  emissive: "#8B4513", // Saddle Brown for deep gold shadows
  emissiveIntensity: 0.1
});

// Helper for glass profile - creates a pear-like shape
const GLASS_MAX_RADIUS = 0.75; // Reduced from 0.95 to shrink container volume
const GLASS_NECK_RADIUS = 0.11;
const GLASS_BULB_HEIGHT = 1.4;

const getGlassRadius = (y: number) => {
  const absY = Math.abs(y);
  if (absY <= 0.1) return GLASS_NECK_RADIUS;
  
  // Normalized t from 0 (neck) to 1 (cap)
  const t = Math.min(1, (absY - 0.1) / GLASS_BULB_HEIGHT);
  
  // Sine curve for smooth "dome" shape that matches the reference image
  return GLASS_NECK_RADIUS + (GLASS_MAX_RADIUS - GLASS_NECK_RADIUS) * Math.sin(t * Math.PI / 2);
};

// Generate Lathe Geometry for the entire glass body
const profilePoints = [];
for (let y = 1.6; y >= -1.6; y -= 0.05) {
  profilePoints.push(new THREE.Vector2(getGlassRadius(y), y));
}
const glassGeo = new THREE.LatheGeometry(profilePoints, 64); // Higher segments for smoothness

const capGeo = new THREE.CylinderGeometry(1.1, 1.1, 0.1, 32);
const rodGeo = new THREE.CylinderGeometry(0.05, 0.05, 3.2, 12);
const sandGeo = new THREE.SphereGeometry(0.035, 5, 5); // Increased size from 0.024 to 0.035

const ShakeLogic = ({ hourglassRef, sandRef }: { hourglassRef: React.RefObject<RapierRigidBody>, sandRef: React.RefObject<RapierRigidBody[]> }) => {
  const lastQuat = useRef(new THREE.Quaternion());
  const frameCounter = useRef(0);
  
  useFrame((state, delta) => {
    if (!hourglassRef.current || !sandRef.current) return;

    const body = hourglassRef.current;
    const rawRot = body.rotation();
    const currentQuat = new THREE.Quaternion(rawRot.x, rawRot.y, rawRot.z, rawRot.w);

    // Calculate angular velocity roughly by checking change in rotation
    const angleDiff = lastQuat.current.angleTo(currentQuat);
    const angularSpeed = angleDiff / delta;

    lastQuat.current.copy(currentQuat);

    // Throttle: only run heavy logic every 5 frames
    frameCounter.current += 1;
    if (frameCounter.current % 5 !== 0) return;

    // Threshold for "shaking" - tweaked based on feel
    if (angularSpeed > 2.0) {
      sandRef.current.forEach((sandBody) => {
        // Apply random micro impulse to break arches
        const strength = 0.005 * Math.random(); 
        sandBody.applyImpulse({
          x: (Math.random() - 0.5) * strength,
          y: (Math.random() - 0.5) * strength,
          z: (Math.random() - 0.5) * strength
        }, true);
        
        // Wake up sleeping bodies
        sandBody.wakeUp();
      });
    } else {
      // Aggressive sleeping logic: ONLY for sand at the bottom
      sandRef.current.forEach((sandBody) => {
        const translation = sandBody.translation();
        
        // Only apply aggressive sleep if sand is in the bottom chamber (y < -0.5)
        // This prevents sand from freezing in mid-air or in the neck
        if (translation.y < -0.5) {
          const linVel = sandBody.linvel();
          const angVel = sandBody.angvel();
          const speedSq = linVel.x*linVel.x + linVel.y*linVel.y + linVel.z*linVel.z;
          const angSpeedSq = angVel.x*angVel.x + angVel.y*angVel.y + angVel.z*angVel.z;
          
          // If moving very slowly, kill velocity to stop jitter
          if (speedSq < 0.0005 && angSpeedSq < 0.0005) {
            sandBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
            sandBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
            sandBody.sleep();
          }
        }
      });
    }

    // lastQuat.current.copy(currentQuat); // Moved up to ensure it tracks every frame
  });

  return null;
};

// Sand particles
const Sand = forwardRef<RapierRigidBody[], any>((props, ref) => {
  // We use the forwarded ref to expose the rigid bodies to the parent
  // If no ref is provided, we can fallback to a local ref, but for ShakeLogic we need it exposed.
  // We assume ref is provided as MutableRefObject<RapierRigidBody[]>
  
  const instances = useMemo(() => {
    const instances = [];
    for (let i = 0; i < SAND_COUNT; i++) {
      // Spawn in upper chamber, closer to bottom to reduce initial fall calculation
      const y = 0.2 + Math.random() * 0.6; // Spawn between y=0.2 and y=0.8
      
      // Calculate max radius at this height to stay inside glass
      // Use the new getGlassRadius function
      const maxRadius = getGlassRadius(y) - 0.04; // -0.04 padding for particle size
      
      const r = Math.max(0, maxRadius) * Math.sqrt(Math.random());
      const theta = Math.random() * 2 * Math.PI;
      const x = r * Math.cos(theta);
      const z = r * Math.sin(theta);
      
      instances.push({
        key: 'instance_' + i,
        position: [x, y, z] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
      });
    }
    return instances;
  }, []);

  return (
      <InstancedRigidBodies
      ref={ref}
      instances={instances}
      colliders="ball"
      friction={11111.0} // Friction increased to 0.6 (2x) for much heavier feel
      restitution={0.05} // Low restitution to avoid popping
      linearDamping={0.5} // Increased damping to reduce rolling
      angularDamping={0.5} // Increased damping to reduce rolling
      ccd={true} 
    >
      <instancedMesh args={[sandGeo, sandMaterial, SAND_COUNT]} />
    </InstancedRigidBodies>
  );
});

const HourglassModel = forwardRef<RapierRigidBody, any>((props, ref) => {
  const api = ref as React.MutableRefObject<RapierRigidBody>; // Use forwarded ref
  const groupRef = useRef<THREE.Group>(null);

  // Sync physics body with group rotation from OrbitControls
  useFrame(() => {
    if (api && api.current && groupRef.current) {
      // Set the physics body's kinematic rotation to match the visual group
      api.current.setNextKinematicRotation(groupRef.current.quaternion);
    }
  });

  return (
    <RigidBody ref={api} type="kinematicPosition" colliders="trimesh" friction={0.1} restitution={0.1}>
      <group ref={groupRef}>
        {/* Single Lathe Glass Body */}
        <mesh geometry={glassGeo} material={glassMaterial} />

        {/* Top Cap */}
        <mesh position={[0, 1.55, 0]} geometry={capGeo} material={capMaterial} />

        {/* Bottom Cap */}
        <mesh position={[0, -1.55, 0]} geometry={capGeo} material={capMaterial} />

        {/* Connecting Rods */}
        {[0, 1, 2].map((i) => (
          <mesh 
            key={i} 
            geometry={rodGeo}
            material={capMaterial}
            position={[
              Math.cos(i * Math.PI * 2 / 3) * 1,
              0,
              Math.sin(i * Math.PI * 2 / 3) * 1
            ]} 
          />
        ))}
      </group>
    </RigidBody>
  );
});

export const AnimatedHourglass = () => {
  const sandBodies = useRef<RapierRigidBody[]>(null);
  const hourglassBody = useRef<RapierRigidBody>(null);

  return (
    <div className="w-[200px] mx-auto h-[300px] relative cursor-grab active:cursor-grabbing">
      <Canvas 
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        dpr={[1, 1.5]}
        shadows
      >
        <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={50} />
        <OrbitControls 
          enableZoom={false} 
          enablePan={false}
          autoRotate={false}
          minPolarAngle={Math.PI / 2} // Lock vertical angle to 90 degrees (horizontal view)
          maxPolarAngle={Math.PI / 2} // Lock vertical angle to 90 degrees (horizontal view)
          makeDefault
        />
        
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[5, 5, 5]}
          intensity={1}
          castShadow
        />
        
        <Physics gravity={GRAVITY} timeStep={1/60}>
          <HourglassModel ref={hourglassBody} />
          <Sand ref={sandBodies} />
          <ShakeLogic hourglassRef={hourglassBody} sandRef={sandBodies} />
        </Physics>

        <Environment preset="city" />
      </Canvas>
    </div>
  );
};

export default AnimatedHourglass;
