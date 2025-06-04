import React from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { useRef, useEffect, useState } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import * as THREE from 'three';

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

const CanvasResizer = () => {
    const { size, camera, gl } = useThree();

    useEffect(() => {
        camera.aspect = size.width / size.height;
        camera.updateProjectionMatrix();
        gl.setSize(size.width, size.height);
    }, [size, camera, gl]);

    return null;
};

const RocketModel = ({ rotation, quaternion }) => {
    const gltf = useGLTF("/Rocket.gltf");
    const modelRef = useRef();
    const groupRef = useRef();
    const [isInitialized, setIsInitialized] = useState(false);
    const targetQuaternion = useRef(new THREE.Quaternion());
    const currentQuaternion = useRef(new THREE.Quaternion());    useEffect(() => {
        if (gltf.scene && !isInitialized) {
            const boundingBox = new THREE.Box3().setFromObject(gltf.scene);
            const center = boundingBox.getCenter(new THREE.Vector3());
            gltf.scene.position.sub(center);            // Transform rocket to match hardware coordinate system
            // Hardware: Z=up (rocket length), Y=toward you, X=right
            // Three.js: Y=up, Z=toward camera, X=right
            // Rotate the rocket so it points up along Y-axis (which represents Z in hardware)
            gltf.scene.rotation.set(Math.PI / 2, 0, 0);

            const newColor = new THREE.Color("#9CA3AF");
            gltf.scene.traverse((child) => {
                if (child.isMesh) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(material => {
                            material.transparent = true;
                            material.opacity = 0.5;
                            material.color = newColor;
                        });
                    } else {
                        child.material.transparent = true;
                        child.material.opacity = 0.5;
                        child.material.color = newColor;
                    }
                }
            });

            setIsInitialized(true);
        }
    }, [gltf, isInitialized]);useFrame((state, delta) => {
        if (groupRef.current && isInitialized) {
            // Use quaternion if available, otherwise convert from Euler angles
            if (quaternion && quaternion.w !== undefined) {
                // Hardware coordinate system: Z=up, Y=forward, X=right
                // Three.js coordinate system: Y=up, Z=forward, X=right
                // We need to transform the quaternion to match Three.js coordinates
                targetQuaternion.current.set(
                    quaternion.x,  // X stays the same (right)
                    quaternion.z,  // Z becomes Y (up in Three.js)
                    -quaternion.y, // Y becomes -Z (forward in Three.js, but inverted)
                    quaternion.w
                );
            } else {
                // Convert Euler angles to quaternion with coordinate system transformation
                // Hardware: pitch=rotation around Y, roll=rotation around X, yaw=rotation around Z
                // Three.js: need to map to X=pitch, Y=yaw, Z=roll in the transformed coordinate system
                const euler = new THREE.Euler(
                    THREE.MathUtils.degToRad(rotation.roll),  // Roll around X-axis
                    THREE.MathUtils.degToRad(rotation.yaw),   // Yaw around Z-axis (now Y in Three.js)
                    THREE.MathUtils.degToRad(-rotation.pitch), // Pitch around Y-axis (now -Z in Three.js)
                    'XYZ'
                );
                targetQuaternion.current.setFromEuler(euler);
            }

            // Smooth interpolation
            currentQuaternion.current.slerp(targetQuaternion.current, 0.1);
            groupRef.current.quaternion.copy(currentQuaternion.current);
        }
    });

    return (
        <group ref={groupRef}>
            <primitive ref={modelRef} object={gltf.scene} />
        </group>
    );
};

function Orientation({ rotation, quaternion }) {
    const containerRef = useRef();
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                const { clientWidth, clientHeight } = containerRef.current;
                setDimensions({
                    width: clientWidth,
                    height: clientHeight
                });
            }
        };

        updateDimensions();

        const observer = new ResizeObserver(updateDimensions);
        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        return () => {
            if (containerRef.current) {
                observer.unobserve(containerRef.current);
            }
        };
    }, []);

    return (
        <div className="flex-1 min-w-0" data-swapy-slot="2">
            <div ref={containerRef} data-swapy-item="b" className="border-2 border-[#201F1F] rounded-md flex flex-col h-full w-full overflow-hidden backdrop-blur-sm">
                <div className="w-full bg-[#09090B] flex items-center py-1 px-2 border-b-2 border-[#201F1F] drag-handle cursor-move select-none" data-swapy-handle>
                    <p className="text-[#9CA3AF] text-lg">Orientation</p>
                </div>
                <div className="flex-1 overflow-hidden flex relative">
                    <div className="absolute inset-0 h-full w-full bg-[radial-gradient(#201F1F_1px,transparent_1px)] [background-size:9px_9px]" />
                    {dimensions.width > 0 && dimensions.height > 0 && (                        <Canvas
                            style={{
                                width: dimensions.width,
                                height: dimensions.height,
                                position: 'absolute',
                                left: 0,
                                top: 0
                            }}                            camera={{
                                position: [4, 4, 4],
                                fov: 50,
                                near: 0.1,
                                far: 1000,
                                up: [0, 1, 0] // Y is up in Three.js (maps to Z in your hardware)
                            }}
                        >
                            {/* Axes helper: Red=X(right), Green=Y(up/Z-hardware), Blue=Z(forward/-Y-hardware) */}
                            <axesHelper args={[2]} />
                            <CanvasResizer />
                            <ambientLight intensity={0.5} />
                            <pointLight position={[10, 10, 10]} />
                            <RocketModel rotation={rotation} quaternion={quaternion} />
                            <OrbitControls
                                enableZoom={true}
                                enableRotate={true}
                                enablePan={false}
                                target={[0, 0, 0]}
                                minDistance={3}
                                maxDistance={20}
                            />
                        </Canvas>
                    )}
                </div>
                <div className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-sm rounded p-2 text-xs text-gray-300">
                    <div>Roll: {rotation.roll?.toFixed(1)}°</div>
                    <div>Pitch: {rotation.pitch?.toFixed(1)}°</div>
                    <div>Yaw: {rotation.yaw?.toFixed(1)}°</div>
                </div>
            </div>
        </div>
    )
}

export default Orientation