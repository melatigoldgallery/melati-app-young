// Import Firebase modules
import app, { db, rtdb, auth } from "./configFirebase.js";
import {
  getDatabase,
  ref,
  set,
  get,
  onValue,
  remove,
  push,
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-database.js";
import { uploadFile, getCloudinaryUrl } from "./services/cloudinary-service.js";

// Global variables
let carouselInstance = null;

document.addEventListener("DOMContentLoaded", function () {
  // Initialize date and time display
  updateDateTime();
  setInterval(updateDateTime, 1000);

  // Detect which page we're on
  const isDisplayPage = document.querySelector(".fullscreen-container") !== null;
  const isAdminPage = document.querySelector(".app-container") !== null;

  if (isAdminPage) {
    // Check authentication
    checkAuth().then((isAuthenticated) => {
      if (!isAuthenticated) {
        window.location.href = "index.html";
        return;
      }

      // Initialize event listeners for admin page
      initializeEventListeners();

      // Load settings from Firebase
      loadSettingsFromFirebase();

      // Refresh content lists
      refreshCustomList();
    });
  } else if (isDisplayPage) {
    // Initialize display page with Firebase
    initializeDisplayPageWithFirebase();
  }
});

// Check if user is authenticated
async function checkAuth() {
  try {
    const user = await new Promise((resolve) => {
      const unsubscribe = auth.onAuthStateChanged((user) => {
        unsubscribe();
        resolve(user);
      });
    });

    return !!user;
  } catch (error) {
    console.error("Auth check error:", error);
    return false;
  }
}

// Update date and time display
function updateDateTime() {
  const now = new Date();
  const dateOptions = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
  const timeOptions = { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false };

  const currentDateElement = document.getElementById("current-date");
  const currentTimeElement = document.getElementById("current-time");

  if (currentDateElement) {
    currentDateElement.textContent = now.toLocaleDateString("id-ID", dateOptions);
  }

  if (currentTimeElement) {
    currentTimeElement.textContent = now.toLocaleTimeString("id-ID", timeOptions);
  }

  // Update last update time for gold price if element exists
  const lastUpdateElement = document.getElementById("last-update");
  if (lastUpdateElement) {
    const hours = now.getHours().toString().padStart(2, "0");
    const minutes = now.getMinutes().toString().padStart(2, "0");
    lastUpdateElement.textContent = `${hours}:${minutes} WIB`;
  }
}

// Initialize display page with Firebase
function initializeDisplayPageWithFirebase() {
  // Initialize AOS if available
  if (typeof AOS !== "undefined") {
    AOS.init({
      duration: 1000,
      once: true,
    });
  }

  // Listen for settings changes
  const settingsRef = ref(rtdb, "settings/promotion");
  onValue(settingsRef, (snapshot) => {
    const settings = snapshot.val() || {};
    applySettings(settings);
  });

  // Listen for content changes
  const contentRef = ref(rtdb, "content/promotion");
  onValue(contentRef, (snapshot) => {
    const content = snapshot.val() || {};
    updateCarouselContent(content);
  });

  // Handle connection state
  const connectedRef = ref(rtdb, ".info/connected");
  onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
      console.log("Connected to Firebase");
    } else {
      console.log("Disconnected from Firebase");
      // Show offline message if needed
    }
  });

  // Add event listeners for carousel
  const carousel = document.getElementById("promotionFullscreen");
  if (carousel) {
    // Ensure carousel keeps running even when tab is not active
    window.addEventListener("blur", function () {
      if (carouselInstance) {
        carouselInstance.cycle();
      }
    });

    // Refresh AOS animations on slide change
    carousel.addEventListener("slide.bs.carousel", function (e) {
      console.log(`Sliding to slide ${e.to + 1}`);

      // Refresh AOS animations on the next slide
      const nextSlide = e.relatedTarget;
      if (nextSlide) {
        const animations = nextSlide.querySelectorAll("[data-aos]");
        animations.forEach((element) => {
          element.classList.remove("aos-animate");
          setTimeout(() => {
            element.classList.add("aos-animate");
          }, 10);
        });
      }
    });
  }

  // Periodically ensure carousel is running
  setInterval(function () {
    if (carouselInstance) {
      carouselInstance.cycle();
      console.log("Ensuring carousel is running");
    }
  }, 60000); // Every minute
}

// Apply settings to the carousel
function applySettings(settings) {
  const slideInterval = settings.slideInterval || 30;
  const transitionEffect = settings.transitionEffect || "fade";
  const enableAnimation = settings.enableAnimation !== false;
  const showControls = settings.showControls !== false;
  const autoPlay = settings.autoPlay !== false;

  const carousel = document.getElementById("promotionFullscreen") || document.getElementById("promotionCarousel");
  if (carousel) {
    // Set interval (convert to milliseconds)
    carousel.setAttribute("data-bs-interval", autoPlay ? slideInterval * 1000 : "false");

    // Apply transition effect
    carousel.classList.remove("carousel-fade");
    document.querySelectorAll(".carousel-item").forEach((item) => {
      item.classList.remove("zoom-effect");
    });

    if (transitionEffect === "fade") {
      carousel.classList.add("carousel-fade");
    } else if (transitionEffect === "zoom") {
      document.querySelectorAll(".carousel-item").forEach((item) => {
        item.classList.add("zoom-effect");
      });
    }

    // Apply animation settings
    if (!enableAnimation) {
      document.querySelectorAll(".slide-content").forEach((content) => {
        content.classList.add("no-animation");
      });
    } else {
      document.querySelectorAll(".slide-content").forEach((content) => {
        content.classList.remove("no-animation");
      });
    }

    // Show/hide controls
    const controls = carousel.querySelectorAll(".carousel-control-prev, .carousel-control-next");
    controls.forEach((control) => {
      control.style.display = showControls ? "flex" : "none";
    });

    // Initialize or update Bootstrap carousel
    if (carouselInstance) {
      carouselInstance.dispose();
    }

    // Count slides to determine if we should auto-advance
    const slideCount = carousel.querySelectorAll(".carousel-item").length;
    const actualInterval = slideCount <= 1 ? false : autoPlay ? slideInterval * 1000 : false;

    carouselInstance = new bootstrap.Carousel(carousel, {
      interval: actualInterval,
      wrap: true,
      keyboard: false,
      pause: false, // Don't pause on hover
    });

    console.log(`Carousel initialized with ${slideCount} slides, interval: ${actualInterval}`);
  }
}

// Update carousel content based on Firebase data
function updateCarouselContent(content) {
  const carouselInner =
    document.querySelector("#promotionFullscreen .carousel-inner") ||
    document.querySelector("#promotionCarousel .carousel-inner");
  const carouselIndicators =
    document.querySelector("#promotionFullscreen .carousel-indicators") ||
    document.querySelector("#promotionCarousel .carousel-indicators");

  if (!carouselInner || !carouselIndicators) return;

  // Clear existing content
  carouselInner.innerHTML = "";
  carouselIndicators.innerHTML = "";

  // Get custom items
  let allSlides = [];

  // Add custom items if they exist
  if (content.customItems) {
    // Convert to array if it's an object
    const customItems =
      typeof content.customItems === "object" && !Array.isArray(content.customItems)
        ? Object.values(content.customItems)
        : content.customItems;

    allSlides = allSlides.concat(customItems.filter((item) => item && item.isActive));
  }

  // Sort slides if needed (e.g., by priority or date)
  allSlides.sort((a, b) => (a.order || 0) - (b.order || 0));

  // Check if we're on the display page
  const isDisplayPage = document.querySelector(".fullscreen-container") !== null;

  // For display page, add default slides if no content
  if (isDisplayPage) {
    // Default slides for display page
    const defaultSlides = [
      {
      type: "default",
      template: `
        <div class="thank-you-slide elegant-gold">
          <div class="slide-content" data-aos="fade-up">
            <div class="decorative-element left"></div>
            <div class="content-wrapper">
              <h2>Terima Kasih</h2>
              <div class="divider"><span><i class="fas fa-gem"></i></span></div>
              <h3>Telah Mengunjungi Melati Gold Shop</h3>
              <p >Kami sangat menghargai kepercayaan Anda</p>
              <div class="logo-container">
                <img src="img/Melati.jfif" alt="Melati Gold Shop Logo" class="slide-logo">
              </div>
            </div>
            <div class="decorative-element right"></div>
          </div>
        </div>
      `,
    },
    {
      type: "default",
      template: `
        <div class="thank-you-slide variant-2">
          <div class="slide-content" data-aos="fade-up">
            <div class="decorative-element left"></div>
            <div class="content-wrapper">
              <h2>Kami Senang</h2>
              <div class="divider"><span><i class="fas fa-gem"></i></span></div>
              <h3>Dapat Melayani Anda di Melati Gold Shop</h3>
              <p>Semoga pengalaman berbelanja Anda menyenangkan</p>
              <div class="logo-container">
                <img src="img/Melati.jfif" alt="Melati Gold Shop Logo" class="slide-logo">
              </div>
            </div>
            <div class="decorative-element right"></div>
          </div>
        </div>
      `,
    },
    {
      type: "default",
      template: `
        <div class="thank-you-slide variant-3">
          <div class="slide-content" data-aos="fade-up">
            <div class="decorative-element left"></div>
            <div class="content-wrapper">
              <h2>Terima Kasih</h2>
              <div class="divider"><span><i class="fas fa-gem"></i></span></div>
              <h3>Atas Kepercayaan Anda Kepada Melati Gold Shop</h3>
              <p>Kami berkomitmen memberikan produk dan layanan terbaik</p>
              <div class="logo-container">
                <img src="img/Melati.jfif" alt="Melati Gold Shop Logo" class="slide-logo">
              </div>
            </div>
            <div class="decorative-element right"></div>
          </div>
        </div>
      `,
    },
    ];

    allSlides = defaultSlides.concat(allSlides);
  }

  // Add slides to carousel
  allSlides.forEach((slide, index) => {
    // Create indicator
    const indicator = document.createElement("button");
    indicator.setAttribute("type", "button");
    indicator.setAttribute("data-bs-target", carouselInner.closest(".carousel").id);
    indicator.setAttribute("data-bs-slide-to", index.toString());
    if (index === 0) {
      indicator.classList.add("active");
      indicator.setAttribute("aria-current", "true");
    }
    indicator.setAttribute("aria-label", `Slide ${index + 1}`);
    carouselIndicators.appendChild(indicator);

    // Create slide based on type
    const slideElement = document.createElement("div");
    slideElement.classList.add("carousel-item");
    if (index === 0) slideElement.classList.add("active");

    // Determine slide content based on type
    if (slide.type === "default") {
      slideElement.innerHTML = slide.template;
    } else if (slide.type === "custom") {
      slideElement.innerHTML = createCustomSlide(slide);
    }

    carouselInner.appendChild(slideElement);
  });

  // Reinitialize AOS for new content
  if (typeof AOS !== "undefined") {
    setTimeout(() => {
      AOS.refresh();
    }, 100);
  }

  // Get settings and apply them
  const settingsRef = ref(rtdb, "settings/promotion");
  get(settingsRef)
    .then((snapshot) => {
      const settings = snapshot.val() || {};
      applySettings(settings);
    })
    .catch((error) => {
      console.error("Error getting settings:", error);
      // Apply default settings
      applySettings({});
    });
}

// Create custom slide HTML for display page
function createCustomSlide(slide) {
  if (slide.contentType === "HTML") {
    return `
      <div class="custom-slide">
        <div class="slide-content" data-aos="fade-up">
          <div class="decorative-element left"></div>
          <div class="content-wrapper">
            <div class="custom-html-content">
              ${slide.htmlContent || "<p>No content available</p>"}
            </div>
          </div>
          <div class="decorative-element right"></div>
        </div>
      </div>
    `;
  } else if (slide.contentType === "Gambar") {
    // For images, display fullscreen without additional elements
    // Ensure proper URL handling
    const imageUrl = slide.fileUrl || slide.url || "";
    if (!imageUrl) {
      return `
        <div class="custom-slide">
          <div class="slide-content" data-aos="fade-up">
            <div class="content-wrapper">
              <h2>${slide.title || "Image Not Found"}</h2>
              <p>Image URL is missing or invalid</p>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="fullscreen-image-slide">
        <img src="${imageUrl}" alt="${
      slide.title || "Custom Image"
    }" class="fullscreen-image" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
        <div class="image-error-fallback" style="display: none; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; text-align: center; background: rgba(0,0,0,0.7); padding: 20px; border-radius: 10px;">
          <h2>${slide.title || "Image Not Available"}</h2>
          <p>Image could not be loaded</p>
        </div>
      </div>
    `;
  } else if (slide.contentType === "Video") {
    // For videos, display fullscreen like images
    const videoUrl = slide.fileUrl || slide.url || "";
    if (!videoUrl) {
      return `
        <div class="custom-slide">
          <div class="slide-content" data-aos="fade-up">
            <div class="content-wrapper">
              <h2>${slide.title || "Video Not Found"}</h2>
              <p>Video URL is missing or invalid</p>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="fullscreen-image-slide">
        <video src="${videoUrl}" autoplay muted loop class="fullscreen-image" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"></video>
        <div class="video-error-fallback" style="display: none; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; text-align: center; background: rgba(0,0,0,0.7); padding: 20px; border-radius: 10px;">
          <h2>${slide.title || "Video Not Available"}</h2>
          <p>Video could not be loaded</p>
        </div>
      </div>
    `;
  } else if (slide.contentType === "Gallery") {
    const galleryItems = (slide.images || [])
      .map(
        (img) => `
      <div class="gallery-item">
        <img src="${img.url}" alt="${img.caption || ""}" class="gallery-img" onerror="this.style.display='none';">
        ${img.caption ? `<div class="item-caption">${img.caption}</div>` : ""}
      </div>
    `
      )
      .join("");

    return `
      <div class="custom-slide collection-display">
        <div class="slide-content" data-aos="fade-up">
          <div class="decorative-element left"></div>
          <div class="content-wrapper">
            <h2>${slide.title}</h2>
            <div class="divider"><span><i class="fas fa-${slide.icon || "crown"}"></i></span></div>
            <div class="image-gallery">
              ${galleryItems}
            </div>
            <p>${slide.description || ""}</p>
          </div>
          <div class="decorative-element right"></div>
        </div>
      </div>
    `;
  }

  return "";
}

// ADMIN PAGE SPECIFIC FUNCTIONS

// Initialize event listeners for admin page
function initializeEventListeners() {
  // Custom content form submission
  const customForm = document.getElementById("customContentForm");
  if (customForm) {
    customForm.addEventListener("submit", handleCustomFormSubmit);
  }
  // Settings form submission
  const settingsForm = document.getElementById("settingsForm");
  if (settingsForm) {
    settingsForm.addEventListener("submit", handleSettingsFormSubmit);
  }
  // Content type change handler
  const contentTypeSelect = document.getElementById("contentType");
  if (contentTypeSelect) {
    contentTypeSelect.addEventListener("change", handleContentTypeChange);
  }

  // Logout button
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogout);
  }
  // Tambah custom button
  const addCustomBtn = document.getElementById("addCustomBtn");
  if (addCustomBtn) {
    addCustomBtn.addEventListener("click", function () {
      document.getElementById("customContentForm").style.display = "block";
    });
  }
}

// Handle custom content form submission
async function handleCustomFormSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn.innerHTML;
  try {
    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Menyimpan...';
    const contentType = form.contentType.value;
    const customData = {
      title: form.contentTitle.value,
      description: form.contentDescription?.value || "",
      contentType: contentType,
      isActive: form.contentActive.checked,
      type: "custom",
      order: parseInt(form.contentOrder.value) || 0,
      createdAt: new Date().toISOString(),
    };
    if (contentType === "HTML") {
      customData.htmlContent = form.htmlContent.value;
    } else if (contentType === "Gambar") {
      const imageFile = form.contentFile.files[0];
      if (!imageFile) throw new Error("Pilih file gambar terlebih dahulu");
      const fileUrl = await uploadFile(imageFile);
      customData.fileUrl = fileUrl.url; // Store the full URL
    } else if (contentType === "Video") {
      const videoFile = form.contentFile.files[0];
      if (!videoFile) throw new Error("Pilih file video terlebih dahulu");
      const fileUrl = await uploadFile(videoFile);
      customData.fileUrl = fileUrl.url; // Store the full URL
    } else if (contentType === "Gallery") {
      const galleryImages = [];
      const galleryContainer = document.getElementById("galleryContainer");
      const imageItems = galleryContainer.querySelectorAll(".gallery-upload-item");
      for (const item of imageItems) {
        const imageUrl = item.dataset.url;
        const caption = item.querySelector(".gallery-caption").value;
        if (imageUrl) {
          galleryImages.push({ url: imageUrl, caption: caption });
        }
      }
      if (galleryImages.length === 0) {
        throw new Error("Tambahkan minimal satu gambar ke galeri");
      }
      customData.images = galleryImages;
      customData.icon = form.galleryIcon.value;
    }
    // Jika edit mode, update data lama
    if (form.dataset.mode === "edit" && form.dataset.editId) {
      const itemRef = ref(rtdb, `content/promotion/customItems/${form.dataset.editId}`);
      await set(itemRef, customData);
      form.dataset.mode = "";
      form.dataset.editId = "";
      submitBtn.textContent = "Simpan Konten";
    } else {
      // Save to Firebase (tambah baru)
      const customItemsRef = ref(rtdb, "content/promotion/customItems");
      const newItemRef = push(customItemsRef);
      await set(newItemRef, customData);
    }
    showToast("Konten berhasil disimpan!", "success");
    form.reset();
    resetGalleryContainer();
    handleContentTypeChange();
    form.style.display = "none";
    refreshCustomList();
  } catch (error) {
    console.error("Error saving custom content:", error);
    showToast("Gagal menyimpan konten: " + error.message, "danger");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnText;
  }
}

// Handle settings form submission
async function handleSettingsFormSubmit(e) {
  e.preventDefault();

  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn.innerHTML;
  try {
    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Menyimpan...';

    const settingsData = {
      slideInterval: parseInt(form.slideInterval.value) || 30,
      transitionEffect: form.transitionEffect.value,
      enableAnimation: form.enableAnimation.checked,
      showControls: form.showControls.checked,
      autoPlay: form.autoPlay.checked,
    };

    // Save to Firebase
    const settingsRef = ref(rtdb, "settings/promotion");
    await set(settingsRef, settingsData);

    // Show success message
    showToast("Pengaturan berhasil disimpan!", "success");

    // Update preview carousel with new settings
    applySettings(settingsData);
  } catch (error) {
    console.error("Error saving settings:", error);
    showToast("Gagal menyimpan pengaturan: " + error.message, "danger");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnText;
  }
}

// Handle content type change
function handleContentTypeChange() {
  const contentType = document.getElementById("contentType").value;

  // Hide all content type specific sections
  document.querySelectorAll(".content-type-section").forEach((section) => {
    section.style.display = "none";
  });

  // Show the selected content type section
  const selectedSection = document.getElementById(`${contentType}Section`);
  if (selectedSection) {
    selectedSection.style.display = "block";
  }

  // Update file input label based on content type
  const fileInputLabel = document.getElementById("contentFileLabel");
  if (fileInputLabel) {
    if (contentType === "Gambar") {
      fileInputLabel.textContent = "Pilih Gambar";
    } else if (contentType === "Video") {
      fileInputLabel.textContent = "Pilih Video";
    }
  }

  // Show/hide file input section
  const fileInputSection = document.getElementById("fileInputSection");
  if (fileInputSection) {
    fileInputSection.style.display = contentType === "Gambar" || contentType === "Video" ? "block" : "none";
  }
}

// Reset gallery container
function resetGalleryContainer() {
  const galleryContainer = document.getElementById("galleryContainer");
  if (galleryContainer) {
    galleryContainer.innerHTML = "";
  }
}

// Add gallery image
async function addGalleryImage(e) {
  e.preventDefault();

  const fileInput = document.getElementById("galleryFileInput");
  const file = fileInput.files[0];

  if (!file) {
    showToast("Pilih gambar terlebih dahulu", "warning");
    return;
  }

  try {
    // Show loading indicator
    const galleryAddBtn = document.getElementById("galleryAddBtn");
    const originalBtnText = galleryAddBtn.innerHTML;
    galleryAddBtn.disabled = true;
    galleryAddBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Uploading...';

    // Upload file
    const imageUrl = await uploadFile(file);

    // Create gallery item
    const galleryContainer = document.getElementById("galleryContainer");
    const itemId = "gallery-item-" + Date.now();

    const itemHtml = `
      <div class="gallery-upload-item" id="${itemId}" data-url="${imageUrl.url}">
        <div class="gallery-upload-preview">
          <img src="${imageUrl.url}" alt="Gallery image">
        </div>
        <div class="gallery-upload-controls">
          <input type="text" class="form-control form-control-sm gallery-caption" placeholder="Caption (optional)">
          <button type="button" class="btn btn-sm btn-danger" onclick="removeGalleryItem('${itemId}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;

    galleryContainer.insertAdjacentHTML("beforeend", itemHtml);

    // Reset file input
    fileInput.value = "";
  } catch (error) {
    console.error("Error adding gallery image:", error);
    showToast("Gagal menambahkan gambar: " + error.message, "danger");
  } finally {
    // Reset button
    const galleryAddBtn = document.getElementById("galleryAddBtn");
    galleryAddBtn.disabled = false;
    galleryAddBtn.innerHTML = '<i class="fas fa-plus"></i> Add Image';
  }
}

// Remove gallery item
function removeGalleryItem(itemId) {
  const item = document.getElementById(itemId);
  if (item) {
    item.remove();
  }
}

// Load settings from Firebase
function loadSettingsFromFirebase() {
  const settingsRef = ref(rtdb, "settings/promotion");

  get(settingsRef)
    .then((snapshot) => {
      const settings = snapshot.val() || {};

      // Populate settings form
      const form = document.getElementById("settingsForm");
      if (form) {
        form.slideInterval.value = settings.slideInterval || 30;
        form.transitionEffect.value = settings.transitionEffect || "fade";
        form.enableAnimation.checked = settings.enableAnimation !== false;
        form.showControls.checked = settings.showControls !== false;
        form.autoPlay.checked = settings.autoPlay !== false;
      }

      // Apply settings to preview carousel
      applySettings(settings);
    })
    .catch((error) => {
      console.error("Error loading settings:", error);
      showToast("Gagal memuat pengaturan", "danger");
    });
}

// Refresh custom content list
function refreshCustomList() {
  const customItemsRef = ref(rtdb, "content/promotion/customItems");

  get(customItemsRef)
    .then((snapshot) => {
      const customItems = snapshot.val() || {};
      const customList = document.getElementById("customContentList");

      if (customList) {
        // Clear current list
        customList.innerHTML = "";

        // Check if there are any items
        if (Object.keys(customItems).length === 0) {
          customList.innerHTML = '<div class="list-group-item text-center text-muted">Tidak ada konten kustom</div>';
          return;
        }

        // Convert to array and sort
        const itemsArray = Object.entries(customItems).map(([id, item]) => ({
          id,
          ...item,
        }));

        itemsArray.sort((a, b) => (a.order || 0) - (b.order || 0));

        // Add each item to the list
        itemsArray.forEach((item) => {
          const statusBadge = item.isActive
            ? '<span class="badge bg-success">Active</span>'
            : '<span class="badge bg-secondary">Inactive</span>';

          const typeBadge = `<span class="badge bg-info">${item.contentType}</span>`;

          const itemHtml = `
          <div class="list-group-item d-flex justify-content-between align-items-center">
            <div>
              <h6 class="mb-1">${item.title}</h6>
              <div class="d-flex gap-1">${typeBadge} ${statusBadge}</div>
            </div>
            <div class="btn-group">
              <button class="btn btn-sm btn-outline-primary" onclick="editCustomItem('${item.id}')">
                <i class="fas fa-edit"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger" onclick="deleteCustomItem('${item.id}')">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        `;

          customList.insertAdjacentHTML("beforeend", itemHtml);
        });
      }
    })
    .catch((error) => {
      console.error("Error loading custom content:", error);
      showToast("Gagal memuat daftar konten kustom", "danger");
    });
}

// Edit custom item
function editCustomItem(itemId) {
  const itemRef = ref(rtdb, `content/promotion/customItems/${itemId}`);
  get(itemRef)
    .then((snapshot) => {
      const item = snapshot.val();
      if (!item) {
        showToast("Konten tidak ditemukan", "warning");
        return;
      }
      const form = document.getElementById("customContentForm");
      form.contentTitle.value = item.title || "";
      form.contentType.value = item.contentType || "HTML";
      form.contentActive.checked = item.isActive !== false;
      form.contentOrder.value = item.order || 0;
      handleContentTypeChange();
      if (item.contentType === "HTML") {
        form.htmlContent.value = item.htmlContent || "";
      } else if (item.contentType === "Gallery") {
        form.contentDescription.value = item.description || "";
        form.galleryIcon.value = item.icon || "crown";
        resetGalleryContainer();
        const galleryContainer = document.getElementById("galleryContainer");
        if (item.images && item.images.length > 0) {
          item.images.forEach((image, index) => {
            const itemId = `gallery-item-edit-${index}`;
            const itemHtml = `
            <div class="gallery-upload-item" id="${itemId}" data-url="${image.url}">
              <div class="gallery-upload-preview">
                <img src="${image.url}" alt="Gallery image">
              </div>
              <div class="gallery-upload-controls">
                <input type="text" class="form-control form-control-sm gallery-caption" placeholder="Caption (optional)" value="${
                  image.caption || ""
                }">
                <button type="button" class="btn btn-sm btn-danger" onclick="removeGalleryItem('${itemId}')">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </div>
          `;
            galleryContainer.insertAdjacentHTML("beforeend", itemHtml);
          });
        }
      } else {
        form.contentDescription.value = item.description || "";
        const fileInputNote = document.getElementById("fileInputNote");
        if (fileInputNote) {
          fileInputNote.textContent = "Uploading a new file will replace the existing one";
          fileInputNote.style.display = "block";
        }
      }
      form.dataset.mode = "edit";
      form.dataset.editId = itemId;
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.textContent = "Update Content";
      form.style.display = "block"; // tampilkan form edit
      form.scrollIntoView({ behavior: "smooth" });
    })
    .catch((error) => {
      console.error("Error loading custom item for edit:", error);
      showToast("Gagal memuat data konten", "danger");
    });
}

// Delete custom item
function deleteCustomItem(itemId) {
  if (confirm("Apakah Anda yakin ingin menghapus konten ini?")) {
    const itemRef = ref(rtdb, `content/promotion/customItems/${itemId}`);

    remove(itemRef)
      .then(() => {
        showToast("Konten berhasil dihapus", "success");
        refreshCustomList();
      })
      .catch((error) => {
        console.error("Error deleting custom item:", error);
        showToast("Gagal menghapus konten", "danger");
      });
  }
}

// Handle logout
function handleLogout() {
  auth
    .signOut()
    .then(() => {
      window.location.href = "index.html";
    })
    .catch((error) => {
      console.error("Error signing out:", error);
      showToast("Gagal logout: " + error.message, "danger");
    });
}

// Show toast notification
function showToast(message, type = "info") {
  const toastContainer = document.querySelector(".toast-container");
  if (!toastContainer) return;

  const toastId = "toast-" + Date.now();
  const toastHtml = `
    <div id="${toastId}" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="toast-header">
        <strong class="me-auto">Notification</strong>
        <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
      <div class="toast-body bg-${type} text-white">
        ${message}
      </div>
    </div>
  `;

  toastContainer.insertAdjacentHTML("beforeend", toastHtml);

  const toastElement = document.getElementById(toastId);
  const toast = new bootstrap.Toast(toastElement, { delay: 5000 });

  toast.show();

  // Remove toast from DOM after it's hidden
  toastElement.addEventListener("hidden.bs.toast", () => {
    toastElement.remove();
  });
}

// Make functions available globally
window.editCustomItem = editCustomItem;
window.deleteCustomItem = deleteCustomItem;
window.addGalleryImage = addGalleryImage;
window.removeGalleryItem = removeGalleryItem;
