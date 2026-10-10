import { useEffect } from "react";

/**
 * Renders the Stocksense Logo onto an HTML5 Canvas element.
 * @param {HTMLCanvasElement} canvas - Target canvas element.
 */
function drawStocksenseLogo(canvas) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  // Background
  const bgGrad = ctx.createRadialGradient(
    w / 2,
    h * 0.4,
    50,
    w / 2,
    h * 0.4,
    w * 0.6,
  );

  bgGrad.addColorStop(0, "#151d28");
  bgGrad.addColorStop(1, "#0b1118");

  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // Palette
  const palePink = "#deb3ab";
  const rustOrange = "#c2693f";
  const sageGreen = "#829f82";
  const tagHoleColor = "#111822";

  ctx.save();
  ctx.translate(w / 2, 240);

  // 1. Outer Swirl of S
  ctx.beginPath();
  ctx.strokeStyle = palePink;
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.moveTo(-75, -20);
  ctx.bezierCurveTo(-115, -45, -115, -135, -15, -165);
  ctx.bezierCurveTo(80, -190, 120, -100, 50, -40);
  ctx.bezierCurveTo(15, -10, -85, 30, -65, 120);
  ctx.bezierCurveTo(-50, 185, 35, 195, 75, 145);
  ctx.bezierCurveTo(95, 120, 100, 85, 92, 50);
  ctx.stroke();

  // 2. Inner Swirl of S
  ctx.beginPath();
  ctx.lineWidth = 11;
  ctx.moveTo(-48, -135);
  ctx.bezierCurveTo(-30, -145, 10, -150, 42, -125);
  ctx.bezierCurveTo(75, -100, 65, -60, 25, -35);
  ctx.bezierCurveTo(-25, -5, -55, 35, -48, 85);
  ctx.bezierCurveTo(-42, 130, 5, 160, 52, 140);
  ctx.stroke();

  // 3. Lower Left Accent Tail Arc
  ctx.beginPath();
  ctx.lineWidth = 14;
  ctx.moveTo(-95, 80);
  ctx.bezierCurveTo(-95, 40, -85, 15, -60, 0);
  ctx.stroke();

  // 4. Rising Chart Line & Arrow
  ctx.beginPath();
  ctx.strokeStyle = rustOrange;
  ctx.lineWidth = 12;
  ctx.moveTo(-30, -60);
  ctx.lineTo(5, -95);
  ctx.lineTo(35, -75);
  ctx.lineTo(85, -140);
  ctx.stroke();

  // Arrowhead
  ctx.beginPath();
  ctx.fillStyle = rustOrange;
  ctx.moveTo(65, -155);
  ctx.lineTo(102, -158);
  ctx.lineTo(92, -122);
  ctx.closePath();
  ctx.fill();

  // Graph Data Nodes
  const nodes = [
    { x: 5, y: -95 },
    { x: 35, y: -75 },
  ];

  nodes.forEach((node) => {
    ctx.beginPath();
    ctx.arc(node.x, node.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = palePink;
    ctx.fill();
    ctx.strokeStyle = rustOrange;
    ctx.lineWidth = 3.5;
    ctx.stroke();
  });

  // 5. Price Tag with Rupee Symbol
  ctx.save();
  ctx.translate(-15, 60);
  ctx.rotate((-35 * Math.PI) / 180);

  // Tag String Loop
  ctx.beginPath();
  ctx.strokeStyle = "#9db59d";
  ctx.lineWidth = 5.5;
  ctx.moveTo(0, -32);
  ctx.bezierCurveTo(-5, -55, 45, -65, 30, -25);
  ctx.bezierCurveTo(20, 0, 8, -5, 2, -10);
  ctx.stroke();

  // Tag Body
  ctx.save();
  ctx.shadowColor = "rgba(5, 8, 12, 0.65)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetX = -4;
  ctx.shadowOffsetY = 10;

  ctx.beginPath();
  ctx.fillStyle = sageGreen;
  ctx.moveTo(-35, -10);
  ctx.lineTo(-10, -35);
  ctx.quadraticCurveTo(0, -45, 15, -35);
  ctx.lineTo(45, -5);
  ctx.quadraticCurveTo(55, 5, 45, 15);
  ctx.lineTo(10, 85);
  ctx.quadraticCurveTo(0, 95, -15, 85);
  ctx.lineTo(-45, 55);
  ctx.quadraticCurveTo(-55, 45, -45, 30);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  // Tag Hole
  ctx.beginPath();
  ctx.arc(2, -22, 5.5, 0, Math.PI * 2);
  ctx.fillStyle = tagHoleColor;
  ctx.fill();

  // ₹ Symbol
  const goldGrad = ctx.createLinearGradient(-20, 0, 20, 50);
  goldGrad.addColorStop(0, "#f5d77f");
  goldGrad.addColorStop(0.5, "#c8933b");
  goldGrad.addColorStop(1, "#93621b");

  ctx.fillStyle = goldGrad;
  ctx.font = '900 52px "Arial", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("₹", 0, 28);

  ctx.restore();
  ctx.restore();

  // 6. Brand Typography
  ctx.save();
  ctx.translate(w / 2, 540);
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";

  ctx.font = '800 54px system-ui, -apple-system, "Inter", sans-serif';
  ctx.fillStyle = "#f5f0eb";
  ctx.fillText("Stock", 0, 0);

  ctx.textAlign = "left";
  ctx.font = '700 54px system-ui, -apple-system, "Inter", sans-serif';
  ctx.fillStyle = "#92ab92";
  ctx.fillText("sense", 0, 0);

  ctx.restore();
}
function StockSenseFavicon() {
  useEffect(() => {
    // Render the exact original logo
    const sourceCanvas = document.createElement("canvas");

    sourceCanvas.width = 800;
    sourceCanvas.height = 650;

    drawStocksenseLogo(sourceCanvas);

    /*
     * Tight crop around the actual StockSense symbol.
     * This excludes the "Stock sense" wordmark because
     * that text becomes unreadable in a browser tab.
     */
    const faviconCanvas = document.createElement("canvas");

    faviconCanvas.width = 512;
    faviconCanvas.height = 512;

    const ctx = faviconCanvas.getContext("2d");

    /*
     * Actual symbol region in your original artwork:
     * x ≈ 275 → 520
     * y ≈ 35  → 440
     */
    ctx.drawImage(
      sourceCanvas,

      // source crop
      275,
      35,
      245,
      405,

      // destination
      20,
      0,
      472,
      512,
    );

    const faviconUrl = faviconCanvas.toDataURL("image/png");

    /*
     * Remove EVERY existing favicon.
     * This prevents the old public/favicon.svg
     * from winning over the new icon.
     */
    document
      .querySelectorAll('link[rel*="icon"]')
      .forEach((link) => link.remove());

    /*
     * Add exactly one favicon.
     */
    const favicon = document.createElement("link");

    favicon.id = "stocksense-favicon";

    favicon.rel = "icon";

    favicon.type = "image/png";

    favicon.href = faviconUrl;

    document.head.appendChild(favicon);
  }, []);

  return null;
}
export default StockSenseFavicon;
