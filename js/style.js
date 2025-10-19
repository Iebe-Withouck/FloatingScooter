import * as THREE from 'three'
import { GLTFLoader } from './three/examples/jsm/loaders/GLTFLoader.js'

const canvas = document.querySelector('canvas.webgl')
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x000010)

const sizes = {
  width: window.innerWidth,
  height: window.innerHeight
}

const camera = new THREE.PerspectiveCamera(45, sizes.width / sizes.height, 0.1, 500)
camera.position.set(0, 2, 10)
scene.add(camera)

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

const clock = new THREE.Clock()

const starCount = 5000
const starGeometry = new THREE.BufferGeometry()
const starPositions = new Float32Array(starCount * 3)

for (let i = 0; i < starCount * 3; i++) {
  starPositions[i] = (Math.random() - 0.5) * 200
}

starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.1 })
scene.add(new THREE.Points(starGeometry, starMaterial))

const warpMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uColor1: { value: new THREE.Color(0x00aaff) },
    uColor2: { value: new THREE.Color(0xffffff) }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0); // Original immersive warp look
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uColor1;
    uniform vec3 uColor2;
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv - 0.5;
      float radius = length(uv);
      float speed = uTime * 3.0;
      float lines = sin(30.0 * radius - speed * 5.0);
      float glow = smoothstep(0.4, 0.0, radius);
      vec3 color = mix(uColor1, uColor2, glow + lines * 0.3);
      float vignette = smoothstep(0.8, 0.2, radius);
      color *= vignette;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
  side: THREE.BackSide,
  depthWrite: false
})

const warpSphere = new THREE.Mesh(
  new THREE.SphereGeometry(50, 64, 64),
  warpMaterial
)
scene.add(warpSphere)

const modelMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0x00ff00) } // Initial green
  },
  vertexShader: /* glsl */ `
    uniform float uTime;
    varying vec2 vUv;

    void main() {
      vUv = uv;
      vec3 transformed = position;
      transformed.z += sin(position.y * 2.0 + uTime * 4.0) * 0.1;
      transformed.y += sin(position.x * 3.0 + uTime * 2.0) * 0.05;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform float uTime;
    varying vec2 vUv;

    void main() {
      float lines = abs(sin(vUv.y * 30.0 - uTime * 10.0));
      vec3 color = mix(uColor, vec3(0.0, 0.5, 1.0), lines * 0.3);
      gl_FragColor = vec4(color, 1.0);
    }
  `
})

let model = null
const loader = new GLTFLoader()
loader.load(
  'assets/model.glb',
  (gltf) => {
    gltf.scene.traverse((child) => {
      if (child.isMesh) child.material = modelMaterial
    })
    model = gltf.scene
    model.position.set(0, 0, 0)
    scene.add(model)
  },
  undefined,
  (err) => console.error('❌ GLTF Load Error:', err)
)

const keys = { w: false, a: false, s: false, d: false, space: false, shift: false }
const velocity = new THREE.Vector3()
const acceleration = 0.1
const damping = 0.95
const maxSpeed = 0.3

document.addEventListener('keydown', (e) => {
  if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true
  if (e.code === 'Space') keys.space = true
  if (e.code === 'ShiftLeft') keys.shift = true

  if (e.code === 'ArrowUp') changeModelColor(1)
  if (e.code === 'ArrowDown') changeModelColor(-1)
})

document.addEventListener('keyup', (e) => {
  if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false
  if (e.code === 'Space') keys.space = false
  if (e.code === 'ShiftLeft') keys.shift = false
})

let yaw = 0
let pitch = 0
const sensitivity = 0.002

canvas.addEventListener('click', () => canvas.requestPointerLock())
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    document.addEventListener('mousemove', onMouseMove)
  } else {
    document.removeEventListener('mousemove', onMouseMove)
  }
})
function onMouseMove(e) {
  yaw -= e.movementX * sensitivity
  pitch -= e.movementY * sensitivity
  pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch))
}

let colorIndex = 0
const colors = [
  new THREE.Color(0x00ff00), // green
  new THREE.Color(0xff0000), // red
  new THREE.Color(0x0000ff), // blue
  new THREE.Color(0xffff00), // yellow
  new THREE.Color(0xff00ff)  // magenta
]

function changeModelColor(direction) {
  if (!model) return
  colorIndex = (colorIndex + direction + colors.length) % colors.length
  model.traverse((child) => {
    if (child.isMesh) child.material.uniforms.uColor.value.copy(colors[colorIndex])
  })
}

function animate() {
  const elapsedTime = clock.getElapsedTime()
  warpMaterial.uniforms.uTime.value = elapsedTime
  modelMaterial.uniforms.uTime.value = elapsedTime

  if (model) {
    const input = new THREE.Vector3(
      (keys.d ? 1 : 0) - (keys.a ? 1 : 0),
      (keys.space ? 1 : 0) - (keys.shift ? 1 : 0),
      (keys.s ? 1 : 0) - (keys.w ? 1 : 0)
    ).normalize()

    velocity.addScaledVector(input, acceleration)
    velocity.multiplyScalar(damping)

    if (velocity.length() > maxSpeed) velocity.setLength(maxSpeed)
    model.position.add(velocity)
    model.rotation.y += 0.005

    const camTarget = model.position.clone()
    const distance = 10
    camera.position.x = camTarget.x + Math.sin(yaw) * distance
    camera.position.z = camTarget.z + Math.cos(yaw) * distance
    camera.position.y = camTarget.y + Math.sin(pitch) * distance * 0.5
    camera.lookAt(camTarget)
  }

  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}

window.addEventListener('resize', () => {
  sizes.width = window.innerWidth
  sizes.height = window.innerHeight
  camera.aspect = sizes.width / sizes.height
  camera.updateProjectionMatrix()
  renderer.setSize(sizes.width, sizes.height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

animate()
