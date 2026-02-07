import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface TimeLockedSandProps {
  timeRemaining: number;
  totalTime?: number;
}

const TimeLockedSand: React.FC<TimeLockedSandProps> = ({ 
  timeRemaining, 
  totalTime = 86400 
}) => {
  const totalParticles = 864000;
  const pointsRef = useRef<THREE.Points>(null!);
  const materialRef = useRef<THREE.PointsMaterial>(null!);
  
  // Constants for geometry and physics
  const R_MAX = 1.0;
  const H = 1.4;
  const Y_UP_TIP = 0.1;
  const Y_LOW_TIP = -0.1;
  const R_NECK = 0.03;
  const TAN_30 = 0.577; // tan(30 degrees) for angle of repose
  
  // vY array to track falling velocity
  const vY = useMemo(() => new Float32Array(totalParticles).fill(0), []);

  // Pre-calculate colors
  const goldColor = new THREE.Color("#FFD700");
  const amberColor = new THREE.Color("#FF4500");

  // Initialization (Stage 1 logic) - Recalculate if timeRemaining changes significantly
  const initialPositions = useMemo(() => {
    const positions = new Float32Array(totalParticles * 3);
    const ratio = Math.max(0, Math.min(1, (totalTime - timeRemaining) / totalTime));
    const numLower = Math.floor(totalParticles * ratio);
    
    const upperFillRatio = 1 - ratio;
    const yUpLimit = Y_UP_TIP + H * Math.pow(upperFillRatio, 1/3);
    
    const hBase = H * Math.pow(ratio, 1/3);

    let idx = 0;
    // Upper Part
    for (let i = 0; i < totalParticles - numLower; i++) {
      const u = Math.random();
      const y = Y_UP_TIP + (yUpLimit - Y_UP_TIP) * Math.pow(u, 1/3);
      const rAtY = ((y - Y_UP_TIP) / H) * R_MAX;
      const rho = Math.sqrt(Math.random()) * rAtY;
      const theta = Math.random() * 2 * Math.PI;
      positions[idx++] = rho * Math.cos(theta);
      positions[idx++] = y;
      positions[idx++] = rho * Math.sin(theta);
    }
    // Lower Part - Piling logic: Bottom-up filling
    for (let i = 0; i < numLower; i++) {
      const u = Math.random();
      // yBase: Fill from the absolute bottom (-1.5) upwards based on volume ratio
      // Using cubic root for volumetric filling of a cone
      const y = -1.5 + hBase * Math.pow(u, 1/3);
      
      const theta = Math.random() * 2 * Math.PI;
      // Max radius at this specific height y
      const maxRhoAtY = ((-0.1 - y) / H) * R_MAX;
      
      // Standard distribution for the body of the pile
      const rho = Math.sqrt(Math.random()) * maxRhoAtY;
      
      let x = rho * Math.cos(theta);
      let z = rho * Math.sin(theta);
      
      // Add a slight "peak" effect only for the very top layer of the current pile
      // to simulate the angle of repose growth
      const isTopLayer = u > 0.9;
      let finalY = y;
      if (isTopLayer) {
        const peakHeight = 0.1 * (hBase / H);
        finalY += (peakHeight - TAN_30 * rho * 0.5);
      }

      // Final boundary check
      const rMaxAtActualY = ((-0.1 - finalY) / H) * R_MAX;
      const currentRho = Math.sqrt(x * x + z * z);
      if (currentRho > rMaxAtActualY && currentRho > 0) {
        const ratioClamp = rMaxAtActualY / currentRho;
        x *= ratioClamp;
        z *= ratioClamp;
      }
      
      if (finalY > Y_LOW_TIP) finalY = Y_LOW_TIP;
      if (finalY < -1.5) finalY = -1.5;

      positions[idx++] = x;
      positions[idx++] = finalY;
      positions[idx++] = z;
    }
    return positions;
  }, [Math.floor(timeRemaining * 2)]); // Force rebuild every 0.5 seconds (2Hz) to sync precisely

  useFrame((state, delta) => {
    if (!pointsRef.current || !materialRef.current) return;
    const attr = pointsRef.current.geometry.attributes.position;
    const pos = attr.array as Float32Array;
    
    const currentRatio = Math.max(0, Math.min(1, (totalTime - timeRemaining) / totalTime));
    // Base level of the pile (approximate flat surface equivalent)
    const yLowBase = -1.5 + H * Math.pow(currentRatio, 1/3);
    
    const driftSpeed = H / totalTime; 
    const isUrgent = timeRemaining < 300;
    const jitterAmount = isUrgent ? 0.005 : 0;

    // Update Material Color
    if (isUrgent) {
      const t = Math.abs(Math.sin(state.clock.elapsedTime * 2));
      materialRef.current.color.lerpColors(amberColor, goldColor, 0.5 + 0.5 * t);
    } else {
      materialRef.current.color.copy(goldColor);
    }

    for (let i = 0; i < totalParticles; i++) {
      const i3 = i * 3;
      let x = pos[i3];
      let y = pos[i3 + 1];
      let z = pos[i3 + 2];

      if (y > Y_UP_TIP) {
        // Upper cone physics
        const distSq = x * x + z * z;
        const rMaxAtY = ((y - Y_UP_TIP) / H) * R_MAX;
        
        // 1. Downward drift
        y -= driftSpeed * delta;
        
        // 2. Sliding towards center if near neck or bottom
        if (y < 0.3 || distSq > rMaxAtY * rMaxAtY * 0.8) {
          const slideFactor = (y < 0.15 ? 1.5 : 0.2) * delta;
          x -= x * slideFactor;
          z -= z * slideFactor;
        }

        // 3. Boundary constraint
        const currentRho = Math.sqrt(distSq);
        if (currentRho > rMaxAtY && currentRho > 0) {
          const ratioClamp = rMaxAtY / currentRho;
          x *= ratioClamp;
          z *= ratioClamp;
        }

        // 4. Gravity "Breakaway" - if very close to neck tip and within R_NECK
        if (y < Y_UP_TIP + 0.05 && distSq < R_NECK * R_NECK) {
          y -= 0.1 * delta; // Start falling through
        } else if (y < Y_UP_TIP + 0.01) {
          y = Y_UP_TIP + 0.01; // Rest on the neck floor
        }
        
        if (isUrgent) {
          x += (Math.random() - 0.5) * jitterAmount;
          z += (Math.random() - 0.5) * jitterAmount;
        }
      } else if (y <= Y_UP_TIP && y > Y_LOW_TIP) {
        // Falling through neck and air: keep stream concentrated
        vY[i] += 9.8 * delta;
        y -= vY[i] * delta;
        
        // Stream concentration logic: pull towards center as it falls
        const pullFactor = 5.0 * delta;
        x -= x * pullFactor;
        z -= z * pullFactor;
      } else if (y <= Y_LOW_TIP) {
        // Lower cone piling
        const rho = Math.sqrt(x * x + z * z);
        // Peak height logic for the dynamic pile surface
        const currentPeakHeight = 0.1 * ((yLowBase + 1.5) / H);
        const ySurface = yLowBase + (currentPeakHeight - TAN_30 * rho * 0.5);

        // Boundary for lower cone glass wall
        const rMaxAtY = ((-0.1 - y) / H) * R_MAX;

        if (y > ySurface) {
          // Free falling towards the pile
          vY[i] += 9.8 * delta;
          y -= vY[i] * delta;
          
          // Pull towards center while falling to keep the stream tight
          const streamPull = 2.0 * delta;
          x -= x * streamPull;
          z -= z * streamPull;

          if (y <= ySurface) {
            y = ySurface;
            vY[i] = 0;
          }
        } else {
          // Rest on surface - small jitter to simulate settling
          const settleFactor = 0.01 * delta;
          x += (Math.random() - 0.5) * settleFactor;
          z += (Math.random() - 0.5) * settleFactor;
          
          // Strict boundary constraint for lower cone
          const currentRho = Math.sqrt(x * x + z * z);
          if (currentRho > rMaxAtY && currentRho > 0) {
            const ratioClamp = rMaxAtY / currentRho;
            x *= ratioClamp;
            z *= ratioClamp;
          }
          vY[i] = 0;
          
          // Prevent sand from sinking through the bottom
          if (y < -1.5) y = -1.5;
        }
      }

      pos[i3] = x;
      pos[i3 + 1] = y;
      pos[i3 + 2] = z;
    }
    
    attr.needsUpdate = true;
  });

  return (
    <group>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={totalParticles}
            array={initialPositions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          ref={materialRef}
          color="#FFD700"
          size={0.012}
          sizeAttenuation={true}
          depthWrite={false}
          transparent={true}
          opacity={0.8}
        />
      </points>
    </group>
  );
};

export default TimeLockedSand;
