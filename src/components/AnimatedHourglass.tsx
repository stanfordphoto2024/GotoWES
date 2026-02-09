import { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, PerspectiveCamera, PresentationControls } from '@react-three/drei';
import { Physics, RigidBody, InstancedRigidBodies, RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';

const SAND_COUNT = 123;
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

const upperGlassGeo = new THREE.CylinderGeometry(1, 0.066, 1.4, 32, 1, true); // Neck radius 0.066
const lowerGlassGeo = new THREE.CylinderGeometry(0.066, 1, 1.4, 32, 1, true); // Neck radius 0.066
const neckGlassGeo = new THREE.CylinderGeometry(0.066, 0.066, 0.2, 32, 1, true); // Neck radius 0.066
const capGeo = new THREE.CylinderGeometry(1.1, 1.1, 0.1, 32);
const rodGeo = new THREE.CylinderGeometry(0.05, 0.05, 3.2, 12);
const sandGeo = new THREE.SphereGeometry(0.025, 10, 10); // Larger size (0.025) and more segments for smoothness

// Reusable Hourglass Visual Parts
const HourglassParts = () => (
  <group>
    {/* Upper Glass Body */}
    <mesh position={[0, 0.8, 0]} geometry={upperGlassGeo} material={glassMaterial} />

    {/* Lower Glass Body */}
    <mesh position={[0, -0.8, 0]} geometry={lowerGlassGeo} material={glassMaterial} />

    {/* Glass Neck Connection */}
    <mesh position={[0, 0, 0]} geometry={neckGlassGeo} material={glassMaterial} />

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
);

// Sand particles
const Sand = () => {
  const rigidBodies = useRef<RapierRigidBody[]>(null);
  
  const instances = useMemo(() => {
    const instances = [];
    for (let i = 0; i < SAND_COUNT; i++) {
      // Spawn in upper chamber
      const r = 0.3 * Math.sqrt(Math.random());
      const theta = Math.random() * 2 * Math.PI;
      const x = r * Math.cos(theta);
      const z = r * Math.sin(theta);
      const y = 0.8 + Math.random() * 0.5; // Upper chamber center is 0.8
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
      ref={rigidBodies}
      instances={instances}
      colliders="ball"
      friction={0.2} // Reduced friction from 0.9 to 0.2
      restitution={0.1} // Increased restitution from 0.0 to 0.1
      linearDamping={0.1} // Reduced damping from 0.5 to 0.1
      angularDamping={0.1} // Reduced damping from 0.2 to 0.1
      ccd={true} 
    >
      <instancedMesh args={[sandGeo, sandMaterial, SAND_COUNT]} castShadow receiveShadow />
    </InstancedRigidBodies>
  );
};

// Physics Body that follows the visual target
const HourglassPhysics = ({ target }: { target: React.RefObject<THREE.Group> }) => {
  const api = useRef<RapierRigidBody>(null);

  useFrame(() => {
    if (api.current && target.current) {
      // Sync physics rotation with the visual group's world rotation
      const q = new THREE.Quaternion();
      target.current.getWorldQuaternion(q);
      api.current.setNextKinematicRotation(q);
    }
  });

  return (
    <RigidBody ref={api} type="kinematicPosition" colliders="trimesh" friction={0.5} restitution={0.1}>
      {/* Invisible collider mesh structure */}
      <group visible={false}>
        <HourglassParts />
      </group>
    </RigidBody>
  );
};

export const AnimatedHourglass = () => {
  const visualRef = useRef<THREE.Group>(null);

  return (
    <div className="w-full h-[300px] relative cursor-grab active:cursor-grabbing">
      <Canvas 
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        dpr={[1, 2]}
        shadows
      >
        <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={50} />
        
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[5, 5, 5]}
          intensity={1}
          castShadow
        />
        
        {/* PresentationControls for Gesture Control */}
        <PresentationControls
          global={false}
          cursor={true}
          snap={true} // Snap back to center
          speed={1.5}
          zoom={0.8}
          rotation={[0, 0, 0]}
          polar={[-Math.PI / 4, Math.PI / 4]} // Limit vertical rotation (approx 45 deg)
          azimuth={[-Math.PI / 4, Math.PI / 4]} // Limit horizontal rotation
        >
          <group ref={visualRef}>
            <HourglassParts />
          </group>
        </PresentationControls>

        <Physics gravity={GRAVITY} timeStep={1/600}>
          <HourglassPhysics target={visualRef} />
          <Sand />
        </Physics>

        <Environment preset="city" />
      </Canvas>
    </div>
  );
};


export default AnimatedHourglass;
