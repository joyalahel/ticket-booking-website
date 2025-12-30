(() => {
  const video = document.getElementById("preview");
  const startBtn = document.getElementById("startScan");
  const stopBtn = document.getElementById("stopScan");
  const statusBox = document.getElementById("statusBox");
  const resultBox = document.getElementById("resultBox");
  const resultBadge = document.getElementById("resultBadge");
  const resultDetails = document.getElementById("resultDetails");
  let stream = null;
  let scanning = false;
  let detector = null;
  let lastPayload = "";
  let cooldown = false;

  function showStatus(msg, type = "secondary") {
    if (!statusBox) return;
    statusBox.textContent = msg;
    statusBox.className = `alert alert-${type}`;
    statusBox.classList.remove("d-none");
  }

  function showResult(approved, details, reason = "") {
    if (!resultBox || !resultBadge || !resultDetails) return;
    resultBox.classList.remove("d-none");
    resultBadge.textContent = approved ? "Approved" : "Rejected";
    resultBadge.className = `badge ${approved ? "badge-approved" : "badge-rejected"}`;
    resultDetails.innerHTML = details + (reason ? `<div class="text-danger mt-1">${reason}</div>` : "");
  }

  async function verifyPayload(qrContent) {
    const token = localStorage.getItem("authToken");
    if (!token) {
      showStatus("Missing auth token. Please log in as admin.", "danger");
      return;
    }
    try {
      const res = await fetch("/api/admin/qr/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ qrContent, markUsed: true })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        showResult(false, "Validation failed.", data.error || "Invalid QR");
        return;
      }

      const meta = data.meta || {};
      const ticketInfo = meta.ticket
        ? `Ticket: ${meta.ticket.ticketId || meta.ticket.ticketIndex || ""}`
        : "";
      const bookingInfo = meta.booking
        ? `Booking #${meta.booking.id || ""} • Status: ${meta.booking.status || ""} • Payment: ${meta.booking.payment_status || ""}`
        : "";
      const seatInfo =
        meta.ticket && meta.ticket.seat
          ? `Seat: ${meta.ticket.seat.section || ""} ${meta.ticket.seat.row || ""}${meta.ticket.seat.seat ? "-" + meta.ticket.seat.seat : ""}`
          : "";
      const details = [ticketInfo, bookingInfo, seatInfo].filter(Boolean).join("<br>");

      showResult(data.approved, details || "Ticket validated.", data.reason || "");
    } catch (err) {
      console.error("Verify QR error:", err);
      showStatus("Network error while verifying.", "danger");
    }
  }

  async function tick() {
    if (!scanning || !detector || cooldown) return;
    try {
      const barcodes = await detector.detect(video);
      if (barcodes && barcodes.length) {
        const payload = barcodes[0].rawValue;
        if (payload && payload !== lastPayload) {
          lastPayload = payload;
          cooldown = true;
          await verifyPayload(payload);
          setTimeout(() => {
            cooldown = false;
          }, 1200);
        }
      }
    } catch (err) {
      console.error("Scan error:", err);
    } finally {
      if (scanning) requestAnimationFrame(tick);
    }
  }

  async function startScanner() {
    if (!("BarcodeDetector" in window)) {
      showStatus("BarcodeDetector not supported on this browser. Use Chrome/Edge on Android or a dedicated QR app.", "danger");
      return;
    }
    try {
      detector = new BarcodeDetector({ formats: ["qr_code"] });
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      video.srcObject = stream;
      await video.play();
      scanning = true;
      showStatus("Point the camera at the QR code.", "primary");
      requestAnimationFrame(tick);
    } catch (err) {
      console.error("Camera start error:", err);
      showStatus("Unable to access camera. Check permissions.", "danger");
    }
  }

  function stopScanner() {
    scanning = false;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    showStatus("Scanner stopped.", "secondary");
  }

  startBtn?.addEventListener("click", startScanner);
  stopBtn?.addEventListener("click", stopScanner);
})();
