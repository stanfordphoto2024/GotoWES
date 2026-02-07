import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, PerspectiveCamera, Float } from '@react-three/drei';
import * as THREE from 'three';

interface HourglassProps {}

const HourglassModel = () => {
  const meshRef = useRef<THREE.Group>(null);

  // Rotate the hourglass slightly for visual interest
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.3;
    }
  });

  return (
    <group ref={meshRef}>
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
  );
};

export const AnimatedHourglass = () => {
  return (
    <div className="w-full h-[300px] relative">
      <Canvas 
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        dpr={[1, 2]} // Supports Retina/High-DPI displays
      >
        <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={50} />
        
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[5, 5, 5]}
          intensity={1}
        />
        
        <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
          <HourglassModel />
        </Float>

        <Environment preset="city" />
      </Canvas>
    </div>
  );
};

export default AnimatedHourglass;
