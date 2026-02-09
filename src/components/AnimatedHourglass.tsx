import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, PerspectiveCamera } from '@react-three/drei';
import { Physics, RigidBody, InstancedRigidBodies, RapierRigidBody, CylinderCollider } from '@react-three/rapier';
import * as THREE from 'three';

const SAND_COUNT = 520;
const GRAVITY: [number, number, number] = [0, -9.8, 0];

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
      friction={0.9} // High friction for sand pile
      restitution={0.0} // No bounce
      linearDamping={0.5} // Air resistance
      angularDamping={0.2} // Rolling damping
      ccd={true} // Continuous Collision Detection
    >
      <instancedMesh args={[undefined, undefined, SAND_COUNT]} castShadow receiveShadow>
        <sphereGeometry args={[0.012, 16, 16]} />
        <meshStandardMaterial color="#fdd835" roughness={0.8} />
      </instancedMesh>
    </InstancedRigidBodies>
  );
};

const HourglassModel = () => {
  const api = useRef<RapierRigidBody>(null);

  // Rotate the hourglass
  useFrame((state) => {
    if (api.current) {
      // Kinematic rotation
      const t = state.clock.getElapsedTime();
      const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, t * 0.3, 0));
      api.current.setNextKinematicRotation(rotation);
    }
  });

  return (
    <RigidBody ref={api} type="kinematicPosition" colliders="trimesh" friction={0.5} restitution={0.1}>
      <group>
        {/* Upper Glass Body: Y in [0.1, 1.5] */}
        <mesh position={[0, 0.8, 0]}>
          <cylinderGeometry args={[1, 0.03, 1.4, 64, 1, true]} />
          <meshPhysicalMaterial
            transmission={1}
            roughness={0.05}
            metalness={0.05}
            thickness={0.02}
            clearcoat={1}
            clearcoatRoughness={0.05}
            ior={1.45}
            color="#e0f7fa"
            transparent={true}
            opacity={0.3}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Lower Glass Body: Y in [-1.5, -0.1] */}
        <mesh position={[0, -0.8, 0]}>
          <cylinderGeometry args={[0.03, 1, 1.4, 64, 1, true]} />
          <meshPhysicalMaterial
            transmission={1}
            roughness={0.05}
            metalness={0.05}
            thickness={0.02}
            clearcoat={1}
            clearcoatRoughness={0.05}
            ior={1.45}
            color="#e0f7fa"
            transparent={true}
            opacity={0.3}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Glass Neck Connection: Y in [-0.1, 0.1] */}
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.2, 64, 1, true]} />
          <meshPhysicalMaterial
            transmission={1}
            roughness={0.05}
            metalness={0.05}
            thickness={0.02}
            clearcoat={1}
            clearcoatRoughness={0.05}
            ior={1.45}
            color="#e0f7fa"
            transparent={true}
            opacity={0.3}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Top Cap */}
        <mesh position={[0, 1.55, 0]}>
          <cylinderGeometry args={[1.1, 1.1, 0.1, 64]} />
          <meshPhysicalMaterial color="#333" metalness={0.8} roughness={0.2} />
        </mesh>

        {/* Bottom Cap */}
        <mesh position={[0, -1.55, 0]}>
          <cylinderGeometry args={[1.1, 1.1, 0.1, 64]} />
          <meshPhysicalMaterial color="#333" metalness={0.8} roughness={0.2} />
        </mesh>

        {/* Connecting Rods */}
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[
            Math.cos(i * Math.PI * 2 / 3) * 1,
            0,
            Math.sin(i * Math.PI * 2 / 3) * 1
          ]}>
            <cylinderGeometry args={[0.05, 0.05, 3.2, 16]} />
            <meshPhysicalMaterial color="#333" metalness={0.8} roughness={0.2} />
          </mesh>
        ))}
      </group>
    </RigidBody>
  );
};

export const AnimatedHourglass = () => {
  return (
    <div className="w-full h-[300px] relative">
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
        
        <Physics gravity={GRAVITY} timeStep={1/600}>
          <HourglassModel />
          <Sand />
        </Physics>

        <Environment preset="city" />
      </Canvas>
    </div>
  );
};

export default AnimatedHourglass;
