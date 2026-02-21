import { useEffect, useRef } from "react";

export default function AuthSmokeBackground() {
  const mountRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    let renderer;
    let scene;
    let camera;
    let animationId = 0;
    let smokeParticles = [];

    const mount = mountRef.current;
    if (!mount) return undefined;

    async function init() {
      const THREE = await import("three");
      if (!mounted || !mountRef.current) return;

      const width = mount.clientWidth || window.innerWidth;
      const height = mount.clientHeight || window.innerHeight;

      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      renderer.setClearColor(0x000000, 0);
      mount.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(60, width / height, 1, 1200);
      camera.position.z = 420;

      const light = new THREE.DirectionalLight(0xe8f3ff, 0.6);
      light.position.set(0, 0, 1);
      scene.add(light);

      const ambient = new THREE.AmbientLight(0x7aa8ff, 0.3);
      scene.add(ambient);

      const textureCanvas = document.createElement("canvas");
      textureCanvas.width = 256;
      textureCanvas.height = 256;
      const ctx = textureCanvas.getContext("2d");
      if (!ctx) return;
      const gradient = ctx.createRadialGradient(128, 128, 24, 128, 128, 120);
      gradient.addColorStop(0, "rgba(220,235,255,0.92)");
      gradient.addColorStop(0.45, "rgba(180,210,250,0.35)");
      gradient.addColorStop(1, "rgba(140,170,230,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 256, 256);

      const smokeTexture = new THREE.CanvasTexture(textureCanvas);
      smokeTexture.needsUpdate = true;

      const smokeMaterial = new THREE.MeshLambertMaterial({
        color: 0xb5cff8,
        map: smokeTexture,
        transparent: true,
        opacity: 0.26,
        depthWrite: false,
      });

      const smokeGeo = new THREE.PlaneGeometry(420, 420);

      smokeParticles = [];
      for (let i = 0; i < 40; i += 1) {
        const particle = new THREE.Mesh(smokeGeo, smokeMaterial);
        particle.position.set(
          Math.random() * 1000 - 500,
          Math.random() * 620 - 310,
          Math.random() * 560 - 280
        );
        particle.rotation.z = Math.random() * Math.PI * 2;
        const scale = 0.75 + Math.random() * 1.15;
        particle.scale.set(scale, scale, scale);
        particle.userData.spin = (Math.random() * 0.0026 + 0.0006) * (Math.random() > 0.5 ? 1 : -1);
        scene.add(particle);
        smokeParticles.push(particle);
      }

      const clock = new THREE.Clock();

      const animate = () => {
        if (!mounted || !renderer || !scene || !camera) return;
        const t = clock.getElapsedTime();
        smokeParticles.forEach((p, index) => {
          p.rotation.z += p.userData.spin;
          p.position.x += Math.sin(t * 0.1 + index) * 0.015;
          p.position.y += Math.cos(t * 0.12 + index * 0.7) * 0.015;
        });
        renderer.render(scene, camera);
        animationId = requestAnimationFrame(animate);
      };

      animate();

      const onResize = () => {
        if (!renderer || !camera || !mountRef.current) return;
        const w = mountRef.current.clientWidth || window.innerWidth;
        const h = mountRef.current.clientHeight || window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };

      window.addEventListener("resize", onResize);

      return () => {
        window.removeEventListener("resize", onResize);
      };
    }

    let cleanupResize;
    init().then((cleanup) => {
      cleanupResize = cleanup;
    });

    return () => {
      mounted = false;
      cancelAnimationFrame(animationId);
      if (cleanupResize) cleanupResize();
      smokeParticles = [];
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      }
    };
  }, []);

  return <div className="auth-smoke-layer" ref={mountRef} aria-hidden="true" />;
}
