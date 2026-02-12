const Service = require("node-windows").Service;
const path = require("path");

// Create a new service object
const svc = new Service({
  name: "Melati Print Service",
  description: "Automated printing service for Melati App - Handles thermal receipt and A4 invoice printing",
  script: path.join(__dirname, "server.js"),
  nodeOptions: ["--harmony", "--max_old_space_size=4096"],
  env: [
    {
      name: "NODE_ENV",
      value: "production",
    },
    {
      name: "PORT",
      value: "3000",
    },
  ],
});

// Listen for the "install" event
svc.on("install", function () {
  console.log("✅ Service installed successfully!");
  console.log("🚀 Starting service...");
  svc.start();
});

// Listen for the "start" event
svc.on("start", function () {
  console.log("✅ Service started successfully!");
  console.log("📡 Print service is now running on http://localhost:3000");
  console.log("🔄 Service will auto-start on Windows boot");
  console.log("\nTo manage the service:");
  console.log("  - Open Services (Win+R → services.msc)");
  console.log('  - Find "Melati Print Service"');
  console.log("  - Right-click to Start/Stop/Restart");
});

// Listen for errors
svc.on("error", function (err) {
  console.error("❌ Service error:", err);
});

// Install the service
console.log("📦 Installing Melati Print Service...");
console.log("⏳ Please wait...\n");
svc.install();
