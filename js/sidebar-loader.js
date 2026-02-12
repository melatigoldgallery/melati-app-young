// Load sidebar dan set active menu
async function initSidebar() {
  const sidebar = document.querySelector(".sidebar");

  try {
    const response = await fetch("components/sidebar.html");
    const html = await response.text();
    sidebar.innerHTML = html;

    // Set active menu berdasarkan halaman saat ini
    setActiveMenu();

    // Filter menu berdasarkan role user
    filterMenuByRole();

    // Restore collapse state from localStorage
    restoreCollapseState();

    // Save collapse state on collapse/expand
    setupCollapseSaveListener();
  } catch (error) {
    console.error("Error loading sidebar:", error);
  }
}

// Filter menu berdasarkan role user
function filterMenuByRole() {
  const user = JSON.parse(sessionStorage.getItem("currentUser"));

  // Sembunyikan menu maintenance untuk semua role kecuali supervisor
  const maintenanceMenu = document.querySelector('a[href="maintenance.html"]');
  if (maintenanceMenu) {
    const maintenanceItem = maintenanceMenu.closest(".nav-item");
    if (!user || user.role !== "supervisor") {
      if (maintenanceItem) {
        maintenanceItem.style.display = "none";
      }
    }
  }

  // Sembunyikan menu Kelola Sales untuk semua role kecuali supervisor
  const kelolaSalesMenu = document.querySelector('a[href="kelolaSales.html"]');
  if (kelolaSalesMenu) {
    const kelolaSalesItem = kelolaSalesMenu.closest(".nav-item");
    if (!user || user.role !== "supervisor") {
      if (kelolaSalesItem) {
        kelolaSalesItem.style.display = "none";
      }
    }
  }
}

// Set active menu berdasarkan current page
function setActiveMenu() {
  const currentPage = window.location.pathname.split("/").pop();
  const navLinks = document.querySelectorAll(".sidebar .nav-link");

  navLinks.forEach((link) => {
    const href = link.getAttribute("href");

    // Remove active dari semua link
    link.classList.remove("active");

    // Tambah active jika href sama dengan current page
    if (href === currentPage) {
      link.classList.add("active");

      // Expand parent collapse jika ada (untuk active page saja)
      const parentCollapse = link.closest(".collapse");
      if (parentCollapse) {
        parentCollapse.classList.add("show");

        // Update parent toggle button
        const collapseId = parentCollapse.id;
        const parentToggle = document.querySelector(`[data-bs-target="#${collapseId}"]`);
        if (parentToggle) {
          parentToggle.classList.remove("collapsed");
          parentToggle.setAttribute("aria-expanded", "true");
        }

        // Save this submenu as expanded
        saveCollapseState(collapseId, true);
      }
    }
  });
}

// Restore collapse state from localStorage
function restoreCollapseState() {
  const savedState = localStorage.getItem("sidebarCollapseState");
  if (!savedState) return;

  try {
    const collapseState = JSON.parse(savedState);

    Object.keys(collapseState).forEach((collapseId) => {
      const isExpanded = collapseState[collapseId];
      const collapseElement = document.getElementById(collapseId);
      const toggleButton = document.querySelector(`[data-bs-target="#${collapseId}"]`);

      if (collapseElement && toggleButton) {
        if (isExpanded) {
          collapseElement.classList.add("show");
          toggleButton.classList.remove("collapsed");
          toggleButton.setAttribute("aria-expanded", "true");
        } else {
          collapseElement.classList.remove("show");
          toggleButton.classList.add("collapsed");
          toggleButton.setAttribute("aria-expanded", "false");
        }
      }
    });
  } catch (error) {
    console.error("Error restoring collapse state:", error);
  }
}

// Save collapse state to localStorage
function saveCollapseState(collapseId, isExpanded) {
  try {
    let collapseState = {};
    const savedState = localStorage.getItem("sidebarCollapseState");

    if (savedState) {
      collapseState = JSON.parse(savedState);
    }

    collapseState[collapseId] = isExpanded;
    localStorage.setItem("sidebarCollapseState", JSON.stringify(collapseState));
  } catch (error) {
    console.error("Error saving collapse state:", error);
  }
}

// Setup listener to save collapse state
function setupCollapseSaveListener() {
  const collapseElements = document.querySelectorAll(".sidebar .collapse");

  collapseElements.forEach((collapse) => {
    collapse.addEventListener("shown.bs.collapse", function () {
      saveCollapseState(this.id, true);
    });

    collapse.addEventListener("hidden.bs.collapse", function () {
      saveCollapseState(this.id, false);
    });
  });
}

// Auto init saat DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSidebar);
} else {
  initSidebar();
}
