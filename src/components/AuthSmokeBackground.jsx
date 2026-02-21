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
    let clock;

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
      camera = new THREE.PerspectiveCamera(75, width / height, 1, 10000);
      camera.position.z = 1000;
      scene.add(camera);
      clock = new THREE.Clock();

      const light = new THREE.DirectionalLight(0xffffff, 0.5);
      light.position.set(-1, 0, 1);
      scene.add(light);

      const ambient = new THREE.AmbientLight(0x3b607e, 0.4);
      scene.add(ambient);

      const textureLoader = new THREE.TextureLoader();
      textureLoader.crossOrigin = "";
      let smokeTexture;
      try {
        smokeTexture = await textureLoader.loadAsync(
          "https://s3-us-west-2.amazonaws.com/s.cdpn.io/95637/Smoke-Element.png"
        );
      } catch {
        const fallback = document.createElement("canvas");
        fallback.width = 256;
        fallback.height = 256;
        const ctx = fallback.getContext("2d");
        if (!ctx) return;
        const gradient = ctx.createRadialGradient(128, 128, 24, 128, 128, 120);
        gradient.addColorStop(0, "rgba(220,235,255,0.92)");
        gradient.addColorStop(0.45, "rgba(180,210,250,0.35)");
        gradient.addColorStop(1, "rgba(140,170,230,0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 256, 256);
        smokeTexture = new THREE.CanvasTexture(fallback);
      }

      const smokeMaterial = new THREE.MeshLambertMaterial({
        color: 0x00dddd,
        map: smokeTexture,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      });

      const smokeGeo = new THREE.PlaneGeometry(300, 300);

      smokeParticles = [];
      for (let i = 0; i < 150; i += 1) {
        const particle = new THREE.Mesh(smokeGeo, smokeMaterial);
        particle.position.set(
          Math.random() * 500 - 250,
          Math.random() * 500 - 250,
          Math.random() * 1000 - 100
        );
        particle.rotation.z = Math.random() * 360;
        scene.add(particle);
        smokeParticles.push(particle);
      }

      const animate = () => {
        if (!mounted || !renderer || !scene || !camera) return;
        const delta = clock.getDelta();
        smokeParticles.forEach((p) => {
          p.rotation.z += delta * 0.2;
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
