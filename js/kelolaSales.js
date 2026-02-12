// Import Firebase modules
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";
import { firestore } from "./configFirebase.js";

/**
 * 🎯 Kelola Sales Manager
 *
 * OPTIMASI FIRESTORE READS:
 * - Tidak menggunakan real-time listener (onSnapshot)
 * - Data hanya di-load saat halaman pertama kali dibuka dan setelah CRUD operations
 * - Setiap perubahan data men-trigger event "salesDataUpdated" untuk update cache di staffHelper.js
 */
class KelolaSalesManager {
  constructor() {
    this.salesData = [];
    this.dataTable = null;
    this.currentEditId = null;
  }

  // Initialize
  init() {
    this.attachEventListeners();
    this.loadSalesData();
  }

  // Attach event listeners
  attachEventListeners() {
    document.getElementById("btnTambahSales")?.addEventListener("click", () => this.openModal());
    document.getElementById("btnSimpanSales")?.addEventListener("click", () => this.simpanSales());
    document.getElementById("btnKonfirmasiHapus")?.addEventListener("click", () => this.konfirmasiHapus());
    document.getElementById("salesModal")?.addEventListener("hidden.bs.modal", () => this.resetForm());
  }

  // Load sales data from Firestore
  async loadSalesData() {
    try {
      this.showLoading(true);

      const q = query(collection(firestore, "salesStaff"), orderBy("nama", "asc"));
      const querySnapshot = await getDocs(q);

      this.salesData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      this.renderTable();
    } catch (error) {
      console.error("Error loading sales data:", error);
      this.showError("Gagal memuat data sales");
    } finally {
      this.showLoading(false);
    }
  }

  // Render DataTable
  renderTable() {
    // Destroy existing DataTable
    if (this.dataTable) {
      this.dataTable.destroy();
    }

    const tableBody = document.querySelector("#salesTable tbody");
    if (!tableBody) return;

    // Clear table
    tableBody.innerHTML = "";

    // Populate table
    if (this.salesData.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center text-muted">
            <i class="fas fa-inbox fa-2x mb-2"></i>
            <p>Belum ada data sales</p>
          </td>
        </tr>
      `;
    } else {
      this.salesData.forEach((sales, index) => {
        const row = document.createElement("tr");
        const statusBadge =
          sales.status === "active"
            ? '<span class="badge bg-success">Aktif</span>'
            : '<span class="badge bg-secondary">Tidak Aktif</span>';

        const createdDate = sales.createdAt ? new Date(sales.createdAt.toDate()).toLocaleDateString("id-ID") : "-";

        row.innerHTML = `
          <td class="text-center">${index + 1}</td>
          <td>${sales.nama}</td>
          <td class="text-center">${statusBadge}</td>
          <td class="text-center">${createdDate}</td>
          <td class="text-center">
            <button class="btn btn-sm btn-warning me-1" onclick="kelolaSalesManager.editSales('${sales.id}')">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-sm btn-danger" onclick="kelolaSalesManager.hapusSales('${sales.id}')">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        `;

        tableBody.appendChild(row);
      });
    }

    // Initialize DataTable
    this.dataTable = $("#salesTable").DataTable({
      responsive: true,
      language: {
        search: "Cari:",
        lengthMenu: "Tampilkan _MENU_ data",
        info: "Menampilkan _START_ sampai _END_ dari _TOTAL_ data",
        infoEmpty: "Menampilkan 0 sampai 0 dari 0 data",
        infoFiltered: "(disaring dari _MAX_ total data)",
        paginate: {
          first: "Pertama",
          last: "Terakhir",
          next: "Selanjutnya",
          previous: "Sebelumnya",
        },
      },
    });
  }

  // Open modal for add/edit
  openModal(salesId = null) {
    const modal = new bootstrap.Modal(document.getElementById("salesModal"));
    const modalTitle = document.getElementById("modalTitle");
    const salesIdInput = document.getElementById("salesId");
    const salesNamaInput = document.getElementById("salesNama");
    const salesStatusInput = document.getElementById("salesStatus");

    if (salesId) {
      // Edit mode
      const sales = this.salesData.find((s) => s.id === salesId);
      if (sales) {
        modalTitle.textContent = "Edit Sales";
        salesIdInput.value = sales.id;
        salesNamaInput.value = sales.nama;
        salesStatusInput.value = sales.status || "active";
      }
    } else {
      // Add mode
      modalTitle.textContent = "Tambah Sales";
      this.resetForm();
    }

    modal.show();
  }

  // Reset form
  resetForm() {
    document.getElementById("salesForm")?.reset();
    document.getElementById("salesId").value = "";
    document.getElementById("salesNama")?.classList.remove("is-invalid");
  }

  // Simpan sales (add or update)
  async simpanSales() {
    const salesId = document.getElementById("salesId").value;
    const salesNama = document.getElementById("salesNama").value.trim().toUpperCase();
    const salesStatus = document.getElementById("salesStatus").value;
    const namaInput = document.getElementById("salesNama");

    // Validation
    if (!salesNama) {
      namaInput.classList.add("is-invalid");
      return;
    }

    // Check duplicate name
    const duplicate = this.salesData.find((s) => s.nama === salesNama && s.id !== salesId);
    if (duplicate) {
      namaInput.classList.add("is-invalid");
      this.showError("Nama sales sudah ada");
      return;
    }

    try {
      this.showLoading(true);

      const data = {
        nama: salesNama,
        status: salesStatus,
        updatedAt: Timestamp.now(),
      };

      if (salesId) {
        await updateDoc(doc(firestore, "salesStaff", salesId), data);
        this.showSuccess("Sales berhasil diupdate");
      } else {
        await addDoc(collection(firestore, "salesStaff"), { ...data, createdAt: Timestamp.now() });
        this.showSuccess("Sales berhasil ditambahkan");
      }

      bootstrap.Modal.getInstance(document.getElementById("salesModal")).hide();
      await this.loadSalesData();
      this.notifyStaffHelperUpdate();
    } catch (error) {
      console.error("Error saving sales:", error);
      this.showError("Gagal menyimpan data sales");
    } finally {
      this.showLoading(false);
    }
  }

  // Edit sales
  editSales(salesId) {
    this.openModal(salesId);
  }

  // Hapus sales - show confirmation modal
  hapusSales(salesId) {
    const sales = this.salesData.find((s) => s.id === salesId);
    if (!sales) return;

    this.currentEditId = salesId;
    document.getElementById("deleteNamaSales").textContent = sales.nama;

    const modal = new bootstrap.Modal(document.getElementById("deleteConfirmModal"));
    modal.show();
  }

  // Konfirmasi hapus
  async konfirmasiHapus() {
    if (!this.currentEditId) return;

    try {
      this.showLoading(true);
      await deleteDoc(doc(firestore, "salesStaff", this.currentEditId));
      this.showSuccess("Sales berhasil dihapus");

      bootstrap.Modal.getInstance(document.getElementById("deleteConfirmModal")).hide();
      await this.loadSalesData();
      this.notifyStaffHelperUpdate();
      this.currentEditId = null;
    } catch (error) {
      console.error("Error deleting sales:", error);
      this.showError("Gagal menghapus data sales");
    } finally {
      this.showLoading(false);
    }
  }

  // Notify staffHelper to reload data
  notifyStaffHelperUpdate() {
    window.dispatchEvent(new CustomEvent("salesDataUpdated"));
    localStorage.removeItem("salesStaffCache");
    localStorage.removeItem("salesStaffCacheTimestamp");
    localStorage.setItem("salesStaffNeedsRefresh", "true"); // Flag untuk halaman lain
  }

  // UI Helper Methods
  showLoading(show) {
    if (show) {
      Swal.fire({
        title: "Loading...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });
    } else {
      Swal.close();
    }
  }

  showError(message) {
    Swal.fire({
      icon: "error",
      title: "Error!",
      text: message,
      confirmButtonColor: "#dc3545",
    });
  }

  showSuccess(message) {
    Swal.fire({
      icon: "success",
      title: "Berhasil!",
      text: message,
      timer: 2000,
      showConfirmButton: false,
    });
  }

  // Cleanup
  destroy() {
    this.dataTable?.destroy();
  }
}

// Create global instance
const kelolaSalesManager = new KelolaSalesManager();
window.kelolaSalesManager = kelolaSalesManager;

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  kelolaSalesManager.init();
});

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  kelolaSalesManager.destroy();
});

export default kelolaSalesManager;
