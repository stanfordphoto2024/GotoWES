import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, PerspectiveCamera, ContactShadows, Float } from '@react-three/drei';
import * as THREE from 'three';

interface HourglassProps {
  timeRemaining: number;
}

const HourglassModel = ({ timeRemaining }: HourglassProps) => {
  const meshRef = useRef<THREE.Group>(null);

  // Rotate the hourglass slightly for visual interest
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.3;
    }
  });

  return (
    <group ref={meshRef}>
      {/* Upper Glass Body */}
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[1, 0.1, 1.5, 32, 1, true]} />
        <meshPhysicalMaterial
          transmission={1}
          roughness={0}
          metalness={0}
          thickness={0.1}
          clearcoat={1}
          clearcoatRoughness={0.1}
          ior={1.5}
          color="white"
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Lower Glass Body (Inverted) */}
      <mesh position={[0, -0.8, 0]} rotation={[Math.PI, 0, 0]}>
        <cylinderGeometry args={[1, 0.1, 1.5, 32, 1, true]} />
        <meshPhysicalMaterial
          transmission={1}
          roughness={0}
          metalness={0}
          thickness={0.1}
          clearcoat={1}
          clearcoatRoughness={0.1}
          ior={1.5}
          color="white"
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Top Cap */}
      <mesh position={[0, 1.55, 0]}>
        <cylinderGeometry args={[1.1, 1.1, 0.1, 32]} />
        <meshPhysicalMaterial color="#333" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Bottom Cap */}
      <mesh position={[0, -1.55, 0]}>
        <cylinderGeometry args={[1.1, 1.1, 0.1, 32]} />
        <meshPhysicalMaterial color="#333" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Connecting Rods (optional but makes it look more stable) */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[
          Math.cos(i * Math.PI * 2 / 3) * 1,
          0,
          Math.sin(i * Math.PI * 2 / 3) * 1
        ]}>
          <cylinderGeometry args={[0.05, 0.05, 3.1, 16]} />
          <meshPhysicalMaterial color="#333" metalness={0.8} roughness={0.2} />
        </mesh>
      ))}
    </group>
  );
};

export const AnimatedHourglass = ({ timeRemaining }: HourglassProps) => {
  return (
    <div className="w-full h-[300px] relative">
      <Canvas shadows gl={{ antialias: true }}>
        <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={50} />
        
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[5, 5, 5]}
          intensity={1}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        
        <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
          <HourglassModel timeRemaining={timeRemaining} />
        </Float>

        <Environment preset="city" />
        <ContactShadows
          position={[0, -2.5, 0]}
          opacity={0.4}
          scale={10}
          blur={2.5}
          far={4.5}
        />
      </Canvas>
    </div>
  );
};

export default AnimatedHourglass;
