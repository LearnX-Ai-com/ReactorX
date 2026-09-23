import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { attachOrbitControls, type CameraOrbitState } from './orbitControls';
import { Ion } from './Ion';

export interface HubSceneProps {
  /** Increment to make Ion wave + blink (e.g. on menu interaction). */
  ionWaveKey?: number;
}

/**
 * The home hub: Ion standing in the same ambient lab backdrop (grid +
 * starfield) the reaction chamber uses, so the hub and the views it leads
 * into read as one continuous space rather than a separate menu screen.
 * The 2D radial menu is HTML, layered on top by the caller — this only
 * owns the 3D backdrop and camera.
 */
export function HubScene({ ionWaveKey }: HubSceneProps) {
  const { scene, camera, gl } = useThree();
  const camStateRef = useRef<CameraOrbitState>({ theta: 0.15, phi: 1.28, radius: 5.4 });
  const camTargetRef = useRef(new THREE.Vector3(0, 0.05, 0));

  useEffect(() => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    perspectiveCamera.fov = 42;
    perspectiveCamera.near = 0.1;
    perspectiveCamera.far = 60;
    perspectiveCamera.updateProjectionMatrix();

    scene.background = new THREE.Color(0x0a0f1c);
    scene.fog = new THREE.Fog(0x0a0f1c, 30, 60);

    const root = new THREE.Group();
    scene.add(root);

    root.add(new THREE.AmbientLight(0x445577, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(3, 4, 5);
    root.add(key);
    const rim = new THREE.DirectionalLight(0x2dd4bf, 0.35);
    rim.position.set(-4, 2, -3);
    root.add(rim);

    const grid = new THREE.GridHelper(20, 20, 0x2dd4bf, 0x1b2a44);
    grid.position.y = -1.4;
    (grid.material as THREE.Material & { opacity: number; transparent: boolean }).opacity = 0.25;
    (grid.material as THREE.Material & { transparent: boolean }).transparent = true;
    root.add(grid);

    const starCount = 220;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 10 + Math.random() * 9;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.6;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0x3a4a70, size: 0.05, transparent: true, opacity: 0.6 });
    const stars = new THREE.Points(starGeo, starMat);
    root.add(stars);

    const detach = attachOrbitControls(gl.domElement, camStateRef.current, 3.5, 9);

    return () => {
      detach();
      scene.remove(root);
      grid.geometry.dispose();
      starGeo.dispose();
      starMat.dispose();
    };
    // gl/scene/camera are stable for the lifetime of a given <Canvas>.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame(() => {
    const camState = camStateRef.current;
    const camTarget = camTargetRef.current;
    camera.position.set(
      camTarget.x + camState.radius * Math.sin(camState.phi) * Math.sin(camState.theta),
      camTarget.y + camState.radius * Math.cos(camState.phi),
      camTarget.z + camState.radius * Math.sin(camState.phi) * Math.cos(camState.theta),
    );
    camera.lookAt(camTarget);
  });

  return <Ion variant="full" position={[0, 0, 0]} smallPosition={[0, 0, 0]} waveKey={ionWaveKey} />;
}
