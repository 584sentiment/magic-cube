import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const RubiksCube = () => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const cubesRef = useRef([]);
  const animationRef = useRef(null);
  const isDraggingRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const selectedCubeRef = useRef(null);
  const clickedFaceRef = useRef(null);
  const dragThreshold = 30;
  const hasRotatedRef = useRef(false);
  const rotatingGroupRef = useRef(null);
  const isInitializedRef = useRef(false);
  const initialStateRef = useRef([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [rotationLog, setRotationLog] = useState([]);

  useEffect(() => {
    // 检查是否已经初始化或DOM中已有canvas
    if (!containerRef.current) {
      return;
    }
    const container = containerRef.current;
    isInitializedRef.current = true;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Create rotating group
    const rotatingGroup = new THREE.Group();
    scene.add(rotatingGroup);
    rotatingGroupRef.current = rotatingGroup;

    // Create cubes
    createCubes(scene);

    // Mouse interaction
    const cleanMouseInteraction = setupMouseInteraction(renderer, camera);

    // Animation loop
    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      window.removeEventListener('resize', handleResize);
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach(mat => mat.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      if (typeof cleanMouseInteraction === 'function') {
        cleanMouseInteraction();
      }
    };
  }, []);

  const createCubes = scene => {
    const cubes = [];
    const cubeSize = 1;
    const spacing = 0.1;

    const faceColors = {
      right: 0xff0000, // Red
      left: 0xff8800, // Orange
      up: 0xffffff, // White
      down: 0xffff00, // Yellow
      front: 0x00ff00, // Green
      back: 0x0000ff, // Blue
      inside: 0x1a1a1a, // Dark gray
    };

    const geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);

    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        for (let z = 0; z < 3; z++) {
          const posX = (x - 1) * (cubeSize + spacing);
          const posY = (y - 1) * (cubeSize + spacing);
          const posZ = (z - 1) * (cubeSize + spacing);

          const materials = [
            new THREE.MeshLambertMaterial({
              color: x === 2 ? faceColors.right : faceColors.inside,
            }),
            new THREE.MeshLambertMaterial({
              color: x === 0 ? faceColors.left : faceColors.inside,
            }),
            new THREE.MeshLambertMaterial({
              color: y === 2 ? faceColors.up : faceColors.inside,
            }),
            new THREE.MeshLambertMaterial({
              color: y === 0 ? faceColors.down : faceColors.inside,
            }),
            new THREE.MeshLambertMaterial({
              color: z === 2 ? faceColors.front : faceColors.inside,
            }),
            new THREE.MeshLambertMaterial({
              color: z === 0 ? faceColors.back : faceColors.inside,
            }),
          ];

          const cube = new THREE.Mesh(geometry, materials);
          cube.position.set(posX, posY, posZ);

          cube.userData = {
            x,
            y,
            z,
            originalPosition: new THREE.Vector3(posX, posY, posZ),
          };

          // Add edge lines
          const edges = new THREE.EdgesGeometry(geometry);
          const line = new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 })
          );
          cube.add(line);

          scene.add(cube);
          cubes.push(cube);
        }
      }
    }

    cubesRef.current = cubes;
    saveInitialState(cubes);
  };

  const saveInitialState = cubes => {
    initialStateRef.current = cubes.map(cube => ({
      position: cube.position.clone(),
      quaternion: cube.quaternion.clone(),
      userData: { ...cube.userData },
    }));
  };

  const resetCube = () => {
    if (isAnimating) {
      console.warn('Cannot reset while animating');
      return;
    }

    cubesRef.current.forEach((cube, index) => {
      const initial = initialStateRef.current[index];
      cube.position.copy(initial.position);
      cube.quaternion.copy(initial.quaternion);
      cube.userData = { ...initial.userData };
    });

    addLog('🔄 重置魔方');
  };

  const shuffleCube = async () => {
    if (isAnimating) {
      console.warn('Cannot shuffle while animating');
      return;
    }

    addLog('🎲 开始打乱...');

    const moveCount = 20 + Math.floor(Math.random() * 11);
    const axes = ['x', 'y', 'z'];
    const layers = [0, 1, 2];
    const angles = [Math.PI / 2, -Math.PI / 2, Math.PI, -Math.PI];

    for (let i = 0; i < moveCount; i++) {
      const axis = axes[Math.floor(Math.random() * axes.length)];
      const layer = layers[Math.floor(Math.random() * layers.length)];
      const angle = angles[Math.floor(Math.random() * angles.length)];

      await rotateLayer(axis, layer, angle, 150, true);
    }

    addLog(`✅ 打乱完成 (${moveCount}步)`);
  };

  const rotateLayer = (axis, layer, angle, duration = 300, animate = true) => {
    return new Promise(resolve => {
      if (isAnimating) {
        console.warn('Already animating, please wait...');
        resolve();
        return;
      }

      if (!['x', 'y', 'z'].includes(axis)) {
        console.error('Invalid axis. Must be "x", "y", or "z"');
        resolve();
        return;
      }
      if (layer < 0 || layer > 2) {
        console.error('Invalid layer. Must be 0, 1, or 2');
        resolve();
        return;
      }

      setIsAnimating(true);

      const logEntry = `Rotate ${axis.toUpperCase()}-axis, Layer ${layer}, Angle ${(
        (angle * 180) /
        Math.PI
      ).toFixed(1)}°`;
      addLog(logEntry);

      const group = rotatingGroupRef.current;
      const scene = sceneRef.current;

      const cubesToRotate = cubesRef.current.filter(cube => {
        return cube.userData[axis] === layer;
      });

      cubesToRotate.forEach(cube => {
        scene.remove(cube);
        group.add(cube);
      });

      if (!animate) {
        group.rotation[axis] = angle;
        finalizeCubes(cubesToRotate, group, scene, axis);
        setIsAnimating(false);
        resolve();
        return;
      }

      const startTime = Date.now();
      const startRotation = group.rotation[axis];
      const targetRotation = startRotation + angle;

      const animateRotation = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        const eased = 1 - Math.pow(1 - progress, 3);

        group.rotation[axis] = startRotation + angle * eased;

        if (progress < 1) {
          requestAnimationFrame(animateRotation);
        } else {
          finalizeCubes(cubesToRotate, group, scene, axis);
          setIsAnimating(false);
          resolve();
        }
      };

      animateRotation();
    });
  };

  const finalizeCubes = (cubesToRotate, group, scene, axis) => {
    cubesToRotate.forEach(cube => {
      cube.updateMatrixWorld();

      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      cube.matrixWorld.decompose(pos, quat, scale);

      group.remove(cube);
      scene.add(cube);

      cube.position.copy(pos);
      cube.quaternion.copy(quat);

      const spacing = 1.1;
      cube.userData.x = Math.round(cube.position.x / spacing + 1);
      cube.userData.y = Math.round(cube.position.y / spacing + 1);
      cube.userData.z = Math.round(cube.position.z / spacing + 1);
    });

    group.rotation.set(0, 0, 0);
  };

  const setupMouseInteraction = (renderer, camera) => {
    const raycaster = new THREE.Raycaster();

    const onMouseDown = event => {
      if (isAnimating) return;

      isDraggingRef.current = true;
      hasRotatedRef.current = false;
      startPosRef.current = { x: event.clientX, y: event.clientY };

      const mouse = new THREE.Vector2(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1
      );

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster
        .intersectObjects(cubesRef.current)
        .filter(i => i.object.type === 'Mesh');

      if (intersects.length > 0) {
        selectedCubeRef.current = intersects[0].object;
        clickedFaceRef.current = intersects[0].face;
      } else {
        selectedCubeRef.current = null;
        clickedFaceRef.current = null;
      }
    };

    const onMouseMove = event => {
      if (!isDraggingRef.current) return;

      const deltaX = event.clientX - startPosRef.current.x;
      const deltaY = event.clientY - startPosRef.current.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (distance < dragThreshold) return;

      if (
        selectedCubeRef.current &&
        clickedFaceRef.current &&
        !hasRotatedRef.current
      ) {
        handleCubeRotation(deltaX, deltaY);
      } else if (!selectedCubeRef.current) {
        rotateCameraView(deltaX, deltaY);
      }
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      selectedCubeRef.current = null;
      clickedFaceRef.current = null;
      hasRotatedRef.current = false;
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  };

  const rotateCameraView = (deltaX, deltaY) => {
    const camera = cameraRef.current;
    if (!camera) return;

    const radius = Math.sqrt(
      camera.position.x ** 2 + camera.position.y ** 2 + camera.position.z ** 2
    );

    const rotateSpeed = 0.005;
    const theta = Math.atan2(camera.position.x, camera.position.z);
    const phi = Math.acos(camera.position.y / radius);

    const newTheta = theta - deltaX * rotateSpeed;
    const newPhi = Math.max(
      0.1,
      Math.min(Math.PI - 0.1, phi - deltaY * rotateSpeed)
    );

    camera.position.x = radius * Math.sin(newPhi) * Math.sin(newTheta);
    camera.position.y = radius * Math.cos(newPhi);
    camera.position.z = radius * Math.sin(newPhi) * Math.cos(newTheta);

    camera.lookAt(0, 0, 0);

    startPosRef.current.x += deltaX;
    startPosRef.current.y += deltaY;
  };

  const handleCubeRotation = async (deltaX, deltaY) => {
    if (hasRotatedRef.current) return;
    hasRotatedRef.current = true;

    const cube = selectedCubeRef.current;
    const face = clickedFaceRef.current;
    const camera = cameraRef.current;

    // 获取面的法向量（在世界坐标系中）
    const normal = face.normal.clone();
    normal.applyQuaternion(cube.quaternion);
    normal.normalize();

    // 获取相机方向向量
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    cameraDirection.normalize();

    // 判断这个面是否朝向相机（点积 < 0 表示面向相机）
    const facingCamera = normal.dot(cameraDirection) < 0;

    if (!facingCamera) {
      return;
    }

    // 获取相机的上方向和右方向（相对于屏幕）
    const cameraUp = new THREE.Vector3(0, 1, 0);
    cameraUp.applyQuaternion(camera.quaternion);
    cameraUp.normalize();

    const cameraRight = new THREE.Vector3();
    cameraRight.crossVectors(cameraDirection, cameraUp);
    cameraRight.normalize();

    // 重新计算相机上方向（确保正交）
    cameraUp.crossVectors(cameraRight, cameraDirection);
    cameraUp.normalize();

    // 判断拖拽方向
    const isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);

    let axis = null;
    let layer = null;
    let angle = 0;

    if (isHorizontal) {
      // 水平拖拽

      // 找出与相机右方向最接近的轴
      const axisVectors = {
        x: new THREE.Vector3(1, 0, 0),
        y: new THREE.Vector3(0, 1, 0),
        z: new THREE.Vector3(0, 0, 1),
      };

      // 计算旋转轴：应该垂直于面法向量和相机右方向
      const rotationAxis = new THREE.Vector3();
      rotationAxis.crossVectors(normal, cameraRight);
      rotationAxis.normalize();


      // 找出最接近的世界坐标轴
      let maxDot = 0;
      let bestAxis = 'y';
      for (let [axisName, axisVec] of Object.entries(axisVectors)) {
        const dot = Math.abs(rotationAxis.dot(axisVec));
        if (dot > maxDot) {
          maxDot = dot;
          bestAxis = axisName;
        }
      }

      axis = bestAxis;

      // 确定旋转方向
      const axisVector = axisVectors[axis];
      const direction = rotationAxis.dot(axisVector);

      // 根据立方体在该轴上的位置确定层
      layer = cube.userData[axis];

      // 向左拖拽（deltaX < 0）为正旋转 - 修复方向
      if (deltaX < 0) {
        angle = direction > 0 ? -Math.PI / 2 : Math.PI / 2;
      } else {
        angle = direction > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    } else {
      // 垂直拖拽

      const axisVectors = {
        x: new THREE.Vector3(1, 0, 0),
        y: new THREE.Vector3(0, 1, 0),
        z: new THREE.Vector3(0, 0, 1),
      };

      // 计算旋转轴：应该垂直于面法向量和相机上方向
      const rotationAxis = new THREE.Vector3();
      rotationAxis.crossVectors(normal, cameraUp);
      rotationAxis.normalize();


      // 找出最接近的世界坐标轴
      let maxDot = 0;
      let bestAxis = 'z';
      for (let [axisName, axisVec] of Object.entries(axisVectors)) {
        const dot = Math.abs(rotationAxis.dot(axisVec));
        if (dot > maxDot) {
          maxDot = dot;
          bestAxis = axisName;
        }
      }

      axis = bestAxis;

      // 确定旋转方向
      const axisVector = axisVectors[axis];
      const direction = rotationAxis.dot(axisVector);

      // 根据立方体在该轴上的位置确定层
      layer = cube.userData[axis];

      // 向上拖拽（deltaY < 0）为正旋转
      if (deltaY < 0) {
        angle = direction > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        angle = direction > 0 ? -Math.PI / 2 : Math.PI / 2;
      }
    }

    if (axis && layer !== null) {
      await rotateLayer(axis, layer, angle, 200);
    }
  };

  const addLog = message => {
    setRotationLog(prev => [...prev.slice(-4), message]);
  };

  const handleTest = async testType => {
    switch (testType) {
      case 'y0-90':
        await rotateLayer('y', 0, Math.PI / 2);
        break;
      case 'y0--90':
        await rotateLayer('y', 0, -Math.PI / 2);
        break;
      case 'x1-90':
        await rotateLayer('x', 1, Math.PI / 2);
        break;
      case 'z2-180':
        await rotateLayer('z', 2, Math.PI);
        break;
      case 'sequence':
        await rotateLayer('y', 0, Math.PI / 2, 200);
        await rotateLayer('x', 2, Math.PI / 2, 200);
        await rotateLayer('z', 1, Math.PI / 2, 200);
        await rotateLayer('y', 2, -Math.PI / 2, 200);
        break;
      case 'fast':
        await rotateLayer('y', 1, Math.PI / 2, 0, false);
        break;
      case 'reset':
        resetCube();
        break;
      case 'shuffle':
        await shuffleCube();
        break;
    }
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        margin: 0,
        padding: 0,
      }}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          color: 'white',
          fontFamily: 'monospace',
          background: 'rgba(0,0,0,0.8)',
          padding: '15px',
          borderRadius: '8px',
          fontSize: '13px',
          maxWidth: '300px',
        }}
      >
        <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>魔方旋转方法</h3>
        <div
          style={{ marginBottom: '10px', fontSize: '12px', lineHeight: '1.6' }}
        >
          <code
            style={{
              background: 'rgba(255,255,255,0.1)',
              padding: '2px 4px',
              borderRadius: '3px',
            }}
          >
            rotateLayer(axis, layer, angle)
          </code>
          <br />
          <span style={{ color: '#888' }}>• axis: 'x' | 'y' | 'z'</span>
          <br />
          <span style={{ color: '#888' }}>• layer: 0 | 1 | 2</span>
          <br />
          <span style={{ color: '#888' }}>• angle: 弧度值</span>
        </div>

        <div
          style={{
            padding: '8px',
            background: 'rgba(100, 200, 255, 0.15)',
            borderRadius: '4px',
            marginBottom: '10px',
            fontSize: '11px',
            lineHeight: '1.5',
          }}
        >
          <div
            style={{ color: '#6cf', fontWeight: 'bold', marginBottom: '4px' }}
          >
            🖱️ 交互说明：
          </div>
          <div style={{ color: '#aaa' }}>• 点击空白处拖拽：旋转视角</div>
          <div style={{ color: '#aaa' }}>• 点击魔方拖拽：旋转层</div>
          <div style={{ color: '#aaa' }}>• 横向拖拽：旋转对应行</div>
          <div style={{ color: '#aaa' }}>• 纵向拖拽：旋转对应列</div>
        </div>

        {isAnimating && (
          <div
            style={{
              padding: '8px',
              background: 'rgba(255, 255, 0, 0.2)',
              borderRadius: '4px',
              marginBottom: '10px',
              color: '#ffff00',
            }}
          >
            ⚙️ 旋转中...
          </div>
        )}

        <div style={{ marginTop: '10px', fontSize: '11px' }}>
          <div style={{ color: '#888', marginBottom: '5px' }}>最近操作：</div>
          {rotationLog.map((log, i) => (
            <div
              key={i}
              style={{
                color: '#6cf',
                padding: '2px 0',
                opacity: 0.5 + (i / rotationLog.length) * 0.5,
              }}
            >
              {log}
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          color: 'white',
          fontFamily: 'monospace',
          background: 'rgba(0,0,0,0.8)',
          padding: '15px',
          borderRadius: '8px',
        }}
      >
        <h4 style={{ margin: '0 0 10px 0' }}>测试按钮</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={() => handleTest('y0-90')}
            disabled={isAnimating}
            style={buttonStyle}
          >
            Y轴 底层 +90°
          </button>
          <button
            onClick={() => handleTest('y0--90')}
            disabled={isAnimating}
            style={buttonStyle}
          >
            Y轴 底层 -90°
          </button>
          <button
            onClick={() => handleTest('x1-90')}
            disabled={isAnimating}
            style={buttonStyle}
          >
            X轴 中层 +90°
          </button>
          <button
            onClick={() => handleTest('z2-180')}
            disabled={isAnimating}
            style={buttonStyle}
          >
            Z轴 前层 +180°
          </button>
          <button
            onClick={() => handleTest('sequence')}
            disabled={isAnimating}
            style={{ ...buttonStyle, background: '#ff6b6b' }}
          >
            🔄 连续旋转序列
          </button>
          <button
            onClick={() => handleTest('fast')}
            disabled={isAnimating}
            style={{ ...buttonStyle, background: '#4ecdc4' }}
          >
            ⚡ 快速旋转(无动画)
          </button>
          <div
            style={{
              height: '1px',
              background: 'rgba(255,255,255,0.2)',
              margin: '8px 0',
            }}
          ></div>
          <button
            onClick={() => handleTest('shuffle')}
            disabled={isAnimating}
            style={{
              ...buttonStyle,
              background: '#f39c12',
              fontWeight: 'bold',
            }}
          >
            🎲 一键打乱
          </button>
          <button
            onClick={() => handleTest('reset')}
            disabled={isAnimating}
            style={{ ...buttonStyle, background: '#95a5a6' }}
          >
            🔄 重置魔方
          </button>
        </div>
      </div>
    </div>
  );
};

const buttonStyle = {
  padding: '10px 15px',
  background: '#4a90e2',
  border: 'none',
  borderRadius: '5px',
  color: 'white',
  cursor: 'pointer',
  fontSize: '12px',
  fontFamily: 'monospace',
  transition: 'all 0.2s',
};

export default RubiksCube;
