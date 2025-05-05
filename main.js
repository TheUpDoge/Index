// Three.js Background Animation
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Three.js scene
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  
  // Create renderer and set size
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  
  // Add renderer to DOM
  const backgroundCanvas = document.getElementById('background-canvas');
  if (backgroundCanvas) {
    backgroundCanvas.appendChild(renderer.domElement);
  }
  
  // Create grid
  const gridSize = 50;
  const gridDivisions = 50;
  const gridColor1 = 0xff00ff; // Magenta
  const gridColor2 = 0x00ffff; // Cyan
  
  const grid1 = new THREE.GridHelper(gridSize, gridDivisions, gridColor1, gridColor1);
  const grid2 = new THREE.GridHelper(gridSize, gridDivisions, gridColor2, gridColor2);
  
  grid1.position.y = -5;
  grid2.position.y = -5;
  grid2.rotation.x = Math.PI / 2;
  
  scene.add(grid1);
  scene.add(grid2);
  
  // Add some particles
  const particlesGeometry = new THREE.BufferGeometry();
  const particlesCount = 1000;
  
  const posArray = new Float32Array(particlesCount * 3);
  
  for (let i = 0; i < particlesCount * 3; i++) {
    posArray[i] = (Math.random() - 0.5) * 100;
  }
  
  particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
  
  // Create particle material
  const particlesMaterial = new THREE.PointsMaterial({
    size: 0.1,
    color: 0xffffff,
    transparent: true,
    opacity: 0.8
  });
  
  // Create particle mesh
  const particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial);
  scene.add(particlesMesh);
  
  // Add geometric shapes
  const shapes = [];
  const shapeCount = 15;
  
  for (let i = 0; i < shapeCount; i++) {
    let geometry;
    const random = Math.random();
    
    if (random < 0.33) {
      // Tetrahedron
      geometry = new THREE.TetrahedronGeometry(Math.random() * 2 + 0.5);
    } else if (random < 0.66) {
      // Octahedron
      geometry = new THREE.OctahedronGeometry(Math.random() * 2 + 0.5);
    } else {
      // Icosahedron
      geometry = new THREE.IcosahedronGeometry(Math.random() * 2 + 0.5);
    }
    
    const material = new THREE.MeshBasicMaterial({
      color: Math.random() < 0.5 ? 0xff00ff : 0x00ffff,
      wireframe: true,
      transparent: true,
      opacity: 0.6
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    
    // Random position
    mesh.position.x = (Math.random() - 0.5) * 60;
    mesh.position.y = (Math.random() - 0.5) * 60;
    mesh.position.z = (Math.random() - 0.5) * 60;
    
    // Random rotation
    mesh.rotation.x = Math.random() * Math.PI;
    mesh.rotation.y = Math.random() * Math.PI;
    
    // Random scale
    const scale = Math.random() * 1 + 0.5;
    mesh.scale.set(scale, scale, scale);
    
    scene.add(mesh);
    shapes.push({
      mesh,
      rotationSpeed: {
        x: (Math.random() - 0.5) * 0.01,
        y: (Math.random() - 0.5) * 0.01,
        z: (Math.random() - 0.5) * 0.01
      },
      movementSpeed: {
        x: (Math.random() - 0.5) * 0.05,
        y: (Math.random() - 0.5) * 0.05,
        z: (Math.random() - 0.5) * 0.05
      }
    });
  }
  
  // Position camera
  camera.position.z = 30;
  camera.position.y = 5;
  camera.rotation.x = -0.2;
  
  // Mouse movement effect
  let mouseX = 0;
  let mouseY = 0;
  
  document.addEventListener('mousemove', (event) => {
    mouseX = (event.clientX / window.innerWidth) * 2 - 1;
    mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
  });
  
  // Handle window resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  
  // Animation loop
  function animate() {
    requestAnimationFrame(animate);
    
    // Rotate grids
    grid1.rotation.z += 0.001;
    grid2.rotation.z += 0.001;
    
    // Rotate and move shapes
    shapes.forEach(shape => {
      shape.mesh.rotation.x += shape.rotationSpeed.x;
      shape.mesh.rotation.y += shape.rotationSpeed.y;
      shape.mesh.rotation.z += shape.rotationSpeed.z;
      
      shape.mesh.position.x += shape.movementSpeed.x;
      shape.mesh.position.y += shape.movementSpeed.y;
      shape.mesh.position.z += shape.movementSpeed.z;
      
      // Boundary check and reverse direction
      if (Math.abs(shape.mesh.position.x) > 30) shape.movementSpeed.x *= -1;
      if (Math.abs(shape.mesh.position.y) > 30) shape.movementSpeed.y *= -1;
      if (Math.abs(shape.mesh.position.z) > 30) shape.movementSpeed.z *= -1;
    });
    
    // Rotate particles
    particlesMesh.rotation.y += 0.0005;
    
    // Camera follows mouse slightly
    camera.position.x += (mouseX * 2 - camera.position.x) * 0.02;
    camera.position.y += (mouseY * 2 - camera.position.y) * 0.02;
    camera.lookAt(scene.position);
    
    renderer.render(scene, camera);
  }
  
  animate();
});

// Glitch effect for text
document.addEventListener('DOMContentLoaded', () => {
  const glitchElements = document.querySelectorAll('.glitch');
  
  glitchElements.forEach(element => {
    const text = element.textContent;
    element.setAttribute('data-text', text);
  });
});

// Scroll animations
document.addEventListener('DOMContentLoaded', () => {
  const observerOptions = {
    threshold: 0.1
  };
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);
  
  const elements = document.querySelectorAll('.project-card, .skill-item, .section-title');
  elements.forEach(element => {
    observer.observe(element);
  });
});