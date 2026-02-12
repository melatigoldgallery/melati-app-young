/**
 * Windows Service Uninstaller
 */

const Service = require("node-windows").Service;
const path = require("path");

// Create a new service object
const svc = new Service({
  name: "MelatiPrintService",
  script: path.join(__dirname, "server.js"),
});

// Listen for the "uninstall" event
svc.on("uninstall", function () {
  console.log("✅ Service uninstalled successfully!");
  console.log("Service MelatiPrintService has been removed");
});

// Listen for the "alreadyuninstalled" event
svc.on("alreadyuninstalled", function () {
  console.log("⚠️  Service was not installed");
});

// Listen for errors
svc.on("error", function (err) {
  console.error("❌ Uninstall error:", err);
});

// Uninstall the service
console.log("🔧 Uninstalling Melati Print Service...");
svc.uninstall();
