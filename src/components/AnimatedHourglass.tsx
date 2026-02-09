import { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, PerspectiveCamera, OrbitControls } from '@react-three/drei';
import { Physics, RigidBody, InstancedRigidBodies, RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';

const SAND_COUNT = 88;
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
const sandMaterial = new THREE.MeshStandardMaterial({ color: "#fdd835", roughness: 0.8 });

const upperGlassGeo = new THREE.CylinderGeometry(1, 0.03, 1.4, 32, 1, true);
const lowerGlassGeo = new THREE.CylinderGeometry(0.03, 1, 1.4, 32, 1, true);
const neckGlassGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.2, 32, 1, true);
const capGeo = new THREE.CylinderGeometry(1.1, 1.1, 0.1, 32);
const rodGeo = new THREE.CylinderGeometry(0.05, 0.05, 3.2, 12);
const sandGeo = new THREE.SphereGeometry(0.012, 8, 8);

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
      friction={0.9} 
      restitution={0.0} 
      linearDamping={0.5} 
      angularDamping={0.2} 
      ccd={true} 
    >
      <instancedMesh args={[sandGeo, sandMaterial, SAND_COUNT]} castShadow receiveShadow />
    </InstancedRigidBodies>
  );
};

const HourglassModel = () => {
  const api = useRef<RapierRigidBody>(null);
  const groupRef = useRef<THREE.Group>(null);

  // Sync physics body with group rotation from OrbitControls
  useFrame(() => {
    if (api.current && groupRef.current) {
      // Set the physics body's kinematic rotation to match the visual group
      api.current.setNextKinematicRotation(groupRef.current.quaternion);
    }
  });

  return (
    <RigidBody ref={api} type="kinematicPosition" colliders="trimesh" friction={0.5} restitution={0.1}>
      <group ref={groupRef}>
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
    </RigidBody>
  );
};

export const AnimatedHourglass = () => {
  return (
    <div className="w-full h-[300px] relative cursor-grab active:cursor-grabbing">
      <Canvas 
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        dpr={[1, 2]}
        shadows
      >
        <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={50} />
        <OrbitControls 
          enableZoom={false} 
          enablePan={false}
          autoRotate={true}
          autoRotateSpeed={0.5}
          makeDefault
        />
        
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
