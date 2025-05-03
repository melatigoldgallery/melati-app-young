import { firestore } from "./configFirebase.js";
import {
  collection,
  getDocs,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

// Utility functions
export const aksesorisSaleHandler = {
  // Cache properties
  cache: {
    kodeAksesoris: {
      kotak: null,
      aksesoris: null,
      lastFetched: null
    },
    stockAdditions: {
      data: {},
      lastFetched: {}
    },
    stockData: {
      data: null,
      lastFetched: null
    }
  },
  
  // Other properties
  OPSI_KOTAK: [],
  OPSI_AKSESORIS: [],
  modalKelolaKode: null,
  modalFormKode: null,
  currentKategori: "kotak",
  editingDocId: null,

  // Fungsi inisialisasi
  async init() {
    // Inisialisasi elemen DOM
    this.initDomElements();

    // Fetch data kode aksesoris dari Firestore (dengan caching)
    await this.loadKodeAksesorisData();

    // Inisialisasi modal
    this.initModals();

    // Pasang event listener
    this.attachEventListeners();

    // Inisialisasi tabel
    const selectKategori = document.getElementById("jenis-aksesoris");
    const tbody = document.querySelector("#tableTambahAksesoris tbody");
    this.handleCategoryChange(selectKategori.value, tbody);
     
    // Set tanggal hari ini
    this.setTodayDate();
    
    // Load riwayat penambahan stok
    this.loadStockAdditionHistory();
  },

  // Fungsi untuk mengisi tanggal hari ini
  setTodayDate() {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    
    const formattedDate = `${day}/${month}/${year}`;
    const tanggalInput = document.getElementById("tanggal");
    
    if (tanggalInput) {
        tanggalInput.value = formattedDate;
    }
    
    // Set tanggal filter riwayat juga
    const filterDateInput = document.getElementById("filterDate");
    if (filterDateInput) {
        filterDateInput.value = formattedDate;
    }
  },

  // Fungsi untuk inisialisasi elemen DOM
  initDomElements() {
    const elements = {
      selectKategori: document.getElementById("jenis-aksesoris"),
      btnTambahAksesoris: document.getElementById("btnTambahAksesoris"),
      tbody: document.querySelector("#tableTambahAksesoris tbody"),
      btnSimpanData: document.getElementById("btnSimpanData"),
      btnBatal: document.getElementById("btnBatal"),
      btnKelolaKode: document.getElementById("btnKelolaKode"),
      btnFilterHistory: document.getElementById("btnFilterHistory"),
      filterDate: document.getElementById("filterDate")
    };

    // Validasi elemen DOM
    for (const [key, element] of Object.entries(elements)) {
      if (!element) {
        console.error(`Elemen DOM ${key} tidak ditemukan.`);
      }
    }

    this.elements = elements;
  },

  // Fungsi untuk memuat data kode aksesoris dengan caching
  async loadKodeAksesorisData() {
    const { OPSI_KOTAK, OPSI_AKSESORIS } = await this.fetchKodeAksesoris();
    this.OPSI_KOTAK = OPSI_KOTAK;
    this.OPSI_AKSESORIS = OPSI_AKSESORIS;
  },

  // Fungsi untuk inisialisasi modal
  initModals() {
    const modalKelolaKode = document.getElementById("modalKelolaKode");
    const modalFormKode = document.getElementById("modalFormKode");

    if (modalKelolaKode) {
      this.modalKelolaKode = new bootstrap.Modal(modalKelolaKode);
    }

    if (modalFormKode) {
      this.modalFormKode = new bootstrap.Modal(modalFormKode);
    }
  },

  // Fungsi untuk memasang event listener
  attachEventListeners() {
    // Event listener untuk perubahan kategori
    if (this.elements.selectKategori) {
      this.elements.selectKategori.addEventListener("change", () => {
        this.handleCategoryChange(this.elements.selectKategori.value, this.elements.tbody);
      });
    }

    // Event listener untuk tombol tambah aksesoris
    if (this.elements.btnTambahAksesoris) {
      this.elements.btnTambahAksesoris.addEventListener("click", () => {
        this.tambahBaris(this.elements.selectKategori.value, this.elements.tbody);
      });
    }

    // Event listener untuk tombol simpan data
    if (this.elements.btnSimpanData) {
      this.elements.btnSimpanData.addEventListener("click", () => {
        this.simpanData();
      });
    }

    // Event listener untuk tombol batal
    if (this.elements.btnBatal) {
      this.elements.btnBatal.addEventListener("click", () => {
        this.handleBatalClick();
      });
    }

    // Event listener untuk tombol kelola kode
    if (this.elements.btnKelolaKode) {
      this.elements.btnKelolaKode.addEventListener("click", () => {
        this.showKelolaKodeModal();
      });
    }
    
    // Event listener untuk tombol filter riwayat
    if (this.elements.btnFilterHistory) {
      this.elements.btnFilterHistory.addEventListener("click", () => {
        this.loadStockAdditionHistory();
      });
    }

    // Event listeners untuk tab changes
    const kotakTab = document.getElementById("kotak-tab");
    const aksesorisTab = document.getElementById("aksesoris-tab");

    if (kotakTab) {
      kotakTab.addEventListener("click", () => {
        this.currentKategori = "kotak";
        this.loadKodeBarang("kotak");
      });
    }

    if (aksesorisTab) {
      aksesorisTab.addEventListener("click", () => {
        this.currentKategori = "aksesoris";
        this.loadKodeBarang("aksesoris");
      });
    }

    // Event listeners untuk pencarian
    this.attachSearchListeners();

    // Event listeners untuk tombol tambah kode
    const btnTambahKotak = document.getElementById("btnTambahKotak");
    const btnTambahAksesorisKode = document.getElementById("btnTambahAksesorisKode");

    if (btnTambahKotak) {
      btnTambahKotak.addEventListener("click", () => {
        this.showFormKodeModal("kotak");
      });
    }

    if (btnTambahAksesorisKode) {
      btnTambahAksesorisKode.addEventListener("click", () => {
        this.showFormKodeModal("aksesoris");
      });
    }

    // Event listener untuk tombol simpan kode
    const btnSimpanKode = document.getElementById("btnSimpanKode");
    if (btnSimpanKode) {
      btnSimpanKode.addEventListener("click", () => {
        this.simpanKodeBarang();
      });
    }
    
    // Initialize datepicker for filter date
    if (this.elements.filterDate) {
      $(this.elements.filterDate).datepicker({
        format: 'dd/mm/yyyy',
        autoclose: true,
        language: 'id',
        todayHighlight: true
      });
      
      // Calendar icon click handler
      const filterDateIcon = document.getElementById('filterDateIcon');
      if (filterDateIcon) {
        filterDateIcon.addEventListener('click', () => {
          $(this.elements.filterDate).datepicker('show');
        });
      }
    }
  },

  // Fungsi untuk memasang event listener pencarian
  attachSearchListeners() {
    // Search untuk kotak
    const searchKotak = document.getElementById('searchKotak');
    const clearSearchKotak = document.getElementById('clearSearchKotak');
    
    if (searchKotak) {
        searchKotak.addEventListener('input', () => {
            this.filterTable('kotak', searchKotak.value);
        });
    }
    
    if (clearSearchKotak) {
        clearSearchKotak.addEventListener('click', () => {
            if (searchKotak) {
                searchKotak.value = '';
                this.filterTable('kotak', '');
            }
        });
    }
    
    // Search untuk aksesoris
    const searchAksesoris = document.getElementById('searchAksesoris');
    const clearSearchAksesoris = document.getElementById('clearSearchAksesoris');
    
    if (searchAksesoris) {
        searchAksesoris.addEventListener('input', () => {
            this.filterTable('aksesoris', searchAksesoris.value);
        });
    }
    
    if (clearSearchAksesoris) {
        clearSearchAksesoris.addEventListener('click', () => {
            if (searchAksesoris) {
                searchAksesoris.value = '';
                this.filterTable('aksesoris', '');
            }
        });
    }
  },

  // Fungsi untuk memfilter tabel berdasarkan input pencarian
  filterTable(kategori, searchText) {
    const tableId = kategori === 'kotak' ? 'tableKodeKotak' : 'tableKodeAksesoris';
    const table = document.getElementById(tableId);
    
    if (!table) return;
    
    const rows = table.querySelectorAll('tbody tr');
    const lowerSearchText = searchText.toLowerCase();
    
    rows.forEach(row => {
        const kodeCell = row.cells[1]; // Kolom kode
        const namaCell = row.cells[2]; // Kolom nama
        
        if (!kodeCell || !namaCell) return;
        
        const kodeText = kodeCell.textContent.toLowerCase();
        const namaText = namaCell.textContent.toLowerCase();
        
                // Tampilkan baris jika kode atau nama mengandung teks pencarian
                if (kodeText.includes(lowerSearchText) || namaText.includes(lowerSearchText)) {
                  row.style.display = '';
              } else {
                  row.style.display = 'none';
              }
          });
          
          // Tampilkan pesan jika tidak ada hasil
          const tbody = table.querySelector('tbody');
          const visibleRows = [...rows].filter(row => row.style.display !== 'none');
          
          if (visibleRows.length === 0 && searchText) {
              // Cek apakah sudah ada pesan "tidak ada hasil"
              const noResultRow = [...rows].find(row => row.classList.contains('no-result-row'));
              
              if (!noResultRow) {
                  const newRow = document.createElement('tr');
                  newRow.classList.add('no-result-row');
                  newRow.innerHTML = `<td colspan="5" class="text-center">Tidak ada hasil untuk pencarian "${searchText}"</td>`;
                  tbody.appendChild(newRow);
              }
          } else {
              // Hapus pesan "tidak ada hasil" jika ada
              const noResultRow = tbody.querySelector('.no-result-row');
              if (noResultRow) {
                  noResultRow.remove();
              }
          }
        },
      
        // Fungsi untuk menangani klik tombol batal
        handleBatalClick() {
          if (confirm("Apakah Anda yakin ingin membatalkan?")) {
            this.elements.tbody.innerHTML = "";
            this.handleCategoryChange(this.elements.selectKategori.value, this.elements.tbody);
            document.getElementById("total-items").textContent = "0";
          }
        },
      
        // Fungsi untuk mengambil data kode aksesoris dari Firestore dengan caching
        async fetchKodeAksesoris() {
          try {
            // Check cache validity (cache expires after 10 minutes)
            const now = new Date().getTime();
            const cacheExpiry = 10 * 60 * 1000; // 10 minutes in milliseconds
            
            if (this.cache.kodeAksesoris.lastFetched && 
                (now - this.cache.kodeAksesoris.lastFetched) < cacheExpiry &&
                this.cache.kodeAksesoris.kotak && 
                this.cache.kodeAksesoris.aksesoris) {
              
              console.log("Using cached kode aksesoris data");
              return {
                OPSI_KOTAK: this.cache.kodeAksesoris.kotak,
                OPSI_AKSESORIS: this.cache.kodeAksesoris.aksesoris
              };
            }
            
            console.log("Fetching fresh kode aksesoris data");
            const kotakSnapshot = await getDocs(collection(firestore, "kodeAksesoris", "kategori", "kotak"));
            const aksesorisSnapshot = await getDocs(collection(firestore, "kodeAksesoris", "kategori", "aksesoris"));
      
            const OPSI_KOTAK = [{ value: "0", text: "Pilih Kategori" }];
            const OPSI_AKSESORIS = [{ value: "0", text: "Pilih Kategori" }];
      
            kotakSnapshot.forEach((doc) => {
              const data = doc.data();
              OPSI_KOTAK.push({
                id: doc.id,
                text: data.text,
                nama: data.nama,
              });
            });
      
            aksesorisSnapshot.forEach((doc) => {
              const data = doc.data();
              OPSI_AKSESORIS.push({
                id: doc.id,
                text: data.text,
                nama: data.nama,
              });
            });
            
            // Update cache
            this.cache.kodeAksesoris.kotak = OPSI_KOTAK;
            this.cache.kodeAksesoris.aksesoris = OPSI_AKSESORIS;
            this.cache.kodeAksesoris.lastFetched = now;
      
            return { OPSI_KOTAK, OPSI_AKSESORIS };
          } catch (error) {
            console.error("Error fetching kode aksesoris:", error);
            return {
              OPSI_KOTAK: [{ value: "0", text: "Pilih Kategori" }],
              OPSI_AKSESORIS: [{ value: "0", text: "Pilih Kategori" }],
            };
          }
        },
      
        // Fungsi untuk menangani perubahan kategori
        handleCategoryChange(kategori, tbody) {
          tbody.innerHTML = ""; // Clear table
          const options = kategori === "1" ? this.OPSI_KOTAK : kategori === "2" ? this.OPSI_AKSESORIS : [];
          this.updateAllKodeBarangOptions(options);
          if (options.length) {
            this.tambahBaris(kategori, tbody);
          }
          document.getElementById("total-items").textContent = "0";
        },
      
        // Fungsi untuk memperbarui opsi kode barang
        updateAllKodeBarangOptions(options) {
          const kodeBarangSelects = document.querySelectorAll(".kode-barang");
          kodeBarangSelects.forEach((select) => {
            select.innerHTML = options
              .map((option) => `<option value="${option.text}" data-nama="${option.nama}">${option.text}</option>`)
              .join("");
          });
        },
      
        // Fungsi untuk memuat data kode barang untuk diedit
        async loadKodeBarangData(docId, kategori) {
          try {
            const docRef = doc(firestore, "kodeAksesoris", "kategori", kategori, docId);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
              const data = docSnap.data();
              document.getElementById('textKode').value = data.text;
              document.getElementById('namaKode').value = data.nama;
            } else {
              console.error("Dokumen tidak ditemukan!");
              alert("Data tidak ditemukan!");
            }
          } catch (error) {
            console.error("Error loading kode barang data:", error);
            alert("Gagal memuat data: " + error.message);
          }
        },  
      
        // Fungsi untuk menambah baris baru
        tambahBaris(kategori, tbody) {
          const newRow = document.createElement("tr");
          const rowCount = tbody.children.length + 1;
      
          const options = kategori === "1" ? this.OPSI_KOTAK : this.OPSI_AKSESORIS;
      
          newRow.innerHTML = `
                  <td>${rowCount}</td>
                  <td>
                      <select class="form-select kode-barang">
                          ${options
                            .map(
                              (option) => `<option value="${option.text}" data-nama="${option.nama}">${option.text}</option>`
                            )
                            .join("")}
                      </select>
                  </td>
                  <td><input type="text" class="form-control nama-barang" placeholder="Nama Barang" readonly></td>
                  <td><input type="number" class="form-control jumlah-barang" placeholder="Jumlah" min="1"></td>
                  <td><button type="button" class="btn btn-danger btn-sm btn-hapus"><i class="fas fa-trash"></i></button></td>
              `;
      
          tbody.appendChild(newRow);
          this.attachRowEventListeners(newRow, tbody);
        },
      
        // Fungsi untuk memasang event listener pada baris
        attachRowEventListeners(row, tbody) {
          this.attachCalculationListeners(row, tbody);
          this.attachDeleteListener(row, tbody);
          this.attachKodeBarangListener(row);
        },
      
        // Fungsi untuk memasang event listener perhitungan
        attachCalculationListeners(row, tbody) {
          const jumlahInput = row.querySelector(".jumlah-barang");
          
          jumlahInput.addEventListener("input", () => {
            this.updateTotalItems(tbody);
          });
        },
      
        // Fungsi untuk memasang event listener hapus
        attachDeleteListener(row, tbody) {
          const deleteButton = row.querySelector(".btn-hapus");
          deleteButton.addEventListener("click", () => {
            this.handleDeleteRow(row, tbody);
          });
        },
      
        // Fungsi untuk menangani penghapusan baris
        handleDeleteRow(row, tbody) {
          if (tbody.children.length > 1) {
            row.remove();
            this.renumberRows(tbody);
            this.updateTotalItems(tbody);
          } else {
            alert("Minimal harus ada satu baris!");
          }
        },
      
        // Fungsi untuk memasang event listener pada kode barang
        attachKodeBarangListener(row) {
          const kodeBarangSelect = row.querySelector(".kode-barang");
          const namaBarangInput = row.querySelector(".nama-barang");
      
          kodeBarangSelect.addEventListener("change", () => {
            this.updateNamaBarang(kodeBarangSelect, namaBarangInput);
          });
      
          // Trigger change event to set initial value
          kodeBarangSelect.dispatchEvent(new Event("change"));
        },
      
        // Fungsi untuk memperbarui nama barang
        updateNamaBarang(kodeBarangSelect, namaBarangInput) {
          const selectedOption = kodeBarangSelect.options[kodeBarangSelect.selectedIndex];
          const nama = selectedOption.getAttribute("data-nama");
          namaBarangInput.value = nama || "";
        },
      
        // Fungsi untuk menomori ulang baris
        renumberRows(tbody) {
          const rows = tbody.querySelectorAll("tr");
          rows.forEach((row, index) => {
            row.cells[0].textContent = index + 1;
          });
        },
      
        // Fungsi untuk memperbarui total items
        updateTotalItems(tbody) {
          const jumlahInputs = tbody.querySelectorAll(".jumlah-barang");
          let totalItems = 0;
      
          jumlahInputs.forEach((input) => {
            totalItems += parseInt(input.value) || 0;
          });
      
          const totalItemsElement = document.getElementById("total-items");
          if (totalItemsElement) {
            totalItemsElement.textContent = totalItems;
          }
        },
      
        // Fungsi untuk menyimpan data penambahan stok
        async simpanData() {
          try {
            // Show loading indicator
            this.showLoading(true);
            
            // Validasi data
            if (!this.validateTransactionData()) {
              this.showLoading(false);
              return;
            }
      
            // Kumpulkan data dari tabel
            const items = this.collectItemsData();
            if (!items) {
              this.showLoading(false);
              return;
            }
            
            // Buat objek data penambahan stok
            const stockAdditionData = this.createStockAdditionData(items);
            
            // Simpan data penambahan stok ke Firestore
            const docId = await this.saveStockAdditionToFirestore(stockAdditionData);
            console.log("Stock addition saved with ID:", docId);
            
            // Update stok aksesoris
            await this.updateStokAksesoris(items);
            
            // Tampilkan notifikasi sukses
            this.showSuccessNotification("Stok berhasil ditambahkan!");
            
            // Reload riwayat penambahan stok
            this.loadStockAdditionHistory();
            
            // Reset form
            this.resetForm();
            
            this.showLoading(false);
          } catch (error) {
            console.error("Error saving data:", error);
            this.showErrorNotification("Gagal menyimpan data: " + error.message);
            this.showLoading(false);
          }
        },
      
        // Fungsi untuk validasi data
        validateTransactionData() {
          const tanggal = document.getElementById("tanggal").value;
          const jenisAksesoris = document.getElementById("jenis-aksesoris");
      
          if (!tanggal) {
            this.showErrorNotification("Tanggal harus diisi!");
            return false;
          }
      
          if (jenisAksesoris.value === "Pilih Kategori") {
            this.showErrorNotification("Jenis aksesoris harus dipilih!");
            return false;
          }
      
          return true;
        },
      
        // Fungsi untuk mengumpulkan data item
        collectItemsData() {
          const tbody = document.querySelector("#tableTambahAksesoris tbody");
          const rows = tbody.querySelectorAll("tr");
          const items = [];
          let isValid = true;
      
          rows.forEach((row, index) => {
            const kodeSelect = row.querySelector(".kode-barang");
            const kodeText = kodeSelect.value;
            const namaBarang = row.querySelector(".nama-barang").value;
            const jumlah = row.querySelector(".jumlah-barang").value;
      
            if (kodeText === "Pilih Kategori" || !jumlah) {
              this.showErrorNotification(`Data pada baris ${index + 1} belum lengkap!`);
              isValid = false;
              return;
            }
      
            items.push({
              kodeText: kodeText,
              nama: namaBarang,
              jumlah: parseInt(jumlah),
              kategori: this.elements.selectKategori.value === "1" ? "kotak" : "aksesoris"
            });
          });
      
          return isValid ? items : null;
        },
      
        // Fungsi untuk membuat objek data penambahan stok
        createStockAdditionData(items) {
          const tanggal = document.getElementById("tanggal").value;
          const jenisAksesoris = document.getElementById("jenis-aksesoris");
          const jenisText = jenisAksesoris.options[jenisAksesoris.selectedIndex].text;
      
          return {
            tanggal: tanggal,
            jenisAksesoris: jenisAksesoris.value,
            jenisText: jenisText,
            items: items,
            timestamp: serverTimestamp(),
            totalItems: items.reduce((total, item) => total + item.jumlah, 0)
          };
        },
      
        // Fungsi untuk menyimpan data penambahan stok ke Firestore
        async saveStockAdditionToFirestore(data) {
          try {
            // Simpan ke koleksi stockAdditions
            const docRef = await addDoc(collection(firestore, "stockAdditions"), data);
            console.log("Data berhasil disimpan dengan ID:", docRef.id);
            return docRef.id;
          } catch (error) {
            console.error("Gagal menyimpan data:", error);
            throw error;
          }
        },
      
          // Fungsi untuk memperbarui stok aksesoris
  async updateStokAksesoris(items) {
    try {
      // Refresh stock data cache
      this.cache.stockData.data = null;
      
      for (const item of items) {
        // Cek apakah item sudah ada di koleksi stokAksesoris
        const stokQuery = query(
          collection(firestore, "stokAksesoris"),
          where("kode", "==", item.kodeText)
        );
        
        const stokSnapshot = await getDocs(stokQuery);
        
        if (stokSnapshot.empty) {
          // Jika belum ada, buat dokumen baru
          const newStockData = {
            kode: item.kodeText,
            nama: item.nama,
            kategori: item.kategori,
            stokAwal: 0,
            tambahStok: parseInt(item.jumlah) || 0,
            laku: 0,
            free: 0,
            gantiLock: 0,
            stokAkhir: parseInt(item.jumlah) || 0,
            lastUpdate: serverTimestamp()
          };
          
          await addDoc(collection(firestore, "stokAksesoris"), newStockData);
        } else {
          // Jika sudah ada, update dokumen
          const stokDoc = stokSnapshot.docs[0];
          const stokData = stokDoc.data();
          
          // Hitung stok akhir baru
          const currentTambahStok = parseInt(stokData.tambahStok) || 0;
          const newTambahStok = currentTambahStok + (parseInt(item.jumlah) || 0);
          
          const stokAwal = parseInt(stokData.stokAwal) || 0;
          const laku = parseInt(stokData.laku) || 0;
          const free = parseInt(stokData.free) || 0;
          const gantiLock = parseInt(stokData.gantiLock) || 0;
          
          const stokAkhir = stokAwal + newTambahStok - laku - free - gantiLock;
          
          const updateData = {
            tambahStok: newTambahStok,
            stokAkhir: stokAkhir,
            lastUpdate: serverTimestamp()
          };
          
          await updateDoc(doc(firestore, "stokAksesoris", stokDoc.id), updateData);
        }
      }
    } catch (error) {
      console.error("Error updating stok aksesoris:", error);
      throw error;
    }
  },

  // Fungsi untuk memuat riwayat penambahan stok dengan caching
  async loadStockAdditionHistory() {
    try {
      const filterDateInput = document.getElementById("filterDate");
      if (!filterDateInput) return;
      
      const filterDateStr = filterDateInput.value;
      if (!filterDateStr) return;
      
      // Check cache for this date
      if (this.cache.stockAdditions.data[filterDateStr] && 
          this.cache.stockAdditions.lastFetched[filterDateStr]) {
        
        const cacheTime = this.cache.stockAdditions.lastFetched[filterDateStr];
        const now = new Date().getTime();
        const cacheExpiry = 5 * 60 * 1000; // 5 minutes
        
        if ((now - cacheTime) < cacheExpiry) {
          console.log(`Using cached stock additions for ${filterDateStr}`);
          this.renderStockAdditionHistory(this.cache.stockAdditions.data[filterDateStr]);
          return;
        }
      }
      
      // Parse tanggal filter
      const dateParts = filterDateStr.split('/');
      const filterDate = new Date(dateParts[2], dateParts[1] - 1, dateParts[0]);
      
      // Set waktu ke awal hari
      filterDate.setHours(0, 0, 0, 0);
      
      // Set waktu ke akhir hari untuk end date
      const endDate = new Date(filterDate);
      endDate.setHours(23, 59, 59, 999);
      
      // Query penambahan stok berdasarkan tanggal
      const stockAdditionsRef = collection(firestore, "stockAdditions");
      const q = query(
        stockAdditionsRef,
        where("timestamp", ">=", filterDate),
        where("timestamp", "<=", endDate),
        orderBy("timestamp", "desc")
      );
      
      const snapshot = await getDocs(q);
      
      // Process data
      const historyData = [];
      
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.items && data.items.length) {
          data.items.forEach(item => {
            historyData.push({
              id: doc.id,
              timestamp: data.timestamp,
              kodeText: item.kodeText,
              nama: item.nama,
              jumlah: item.jumlah
            });
          });
        }
      });
      
      // Update cache
      this.cache.stockAdditions.data[filterDateStr] = historyData;
      this.cache.stockAdditions.lastFetched[filterDateStr] = new Date().getTime();
      
      // Render data
      this.renderStockAdditionHistory(historyData);
      
    } catch (error) {
      console.error("Error loading stock addition history:", error);
      const tableBody = document.querySelector("#tableRiwayatTambahStok tbody");
      if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Error: ${error.message}</td></tr>`;
      }
    }
  },
  
  // Render riwayat penambahan stok ke tabel
  renderStockAdditionHistory(historyData) {
    const tableBody = document.querySelector("#tableRiwayatTambahStok tbody");
    if (!tableBody) return;
    
    if (!historyData || historyData.length === 0) {
      const filterDateStr = document.getElementById("filterDate").value;
      tableBody.innerHTML = `<tr><td colspan="4" class="text-center">Tidak ada data penambahan stok pada tanggal ${filterDateStr}</td></tr>`;
      return;
    }
    
    let html = '';
    
    historyData.forEach(item => {
      const date = item.timestamp && item.timestamp.toDate ? 
                  item.timestamp.toDate() : 
                  new Date();
      
      const formattedDate = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      
      html += `
        <tr>
          <td>${formattedDate}</td>
          <td>${item.kodeText || '-'}</td>
          <td>${item.nama || '-'}</td>
          <td>${item.jumlah || 0}</td>
        </tr>
      `;
    });
    
    tableBody.innerHTML = html;
  },

  // Fungsi untuk menampilkan loading indicator
  showLoading(isLoading) {
    if (isLoading) {
      let loadingOverlay = document.getElementById('loadingOverlay');
      if (!loadingOverlay) {
        loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'loadingOverlay';
        loadingOverlay.innerHTML = `
          <div class="loading-spinner">
            <div class="spinner-border text-primary" role="status">
              <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2">Menyimpan data...</p>
          </div>
        `;
        loadingOverlay.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 9999;
        `;
        document.body.appendChild(loadingOverlay);
      } else {
        loadingOverlay.style.display = 'flex';
      }
    } else {
      const loadingOverlay = document.getElementById('loadingOverlay');
      if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
      }
    }
  },

  // Fungsi untuk menampilkan notifikasi sukses
  showSuccessNotification(message) {
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        icon: 'success',
        title: 'Berhasil!',
        text: message,
        confirmButtonColor: '#28a745'
      });
    } else {
      alert(message);
    }
  },

  // Fungsi untuk menampilkan notifikasi error
  showErrorNotification(message) {
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        icon: 'error',
        title: 'Error!',
        text: message,
        confirmButtonColor: '#dc3545'
      });
    } else {
      alert(message);
    }
  },

  // Fungsi untuk mereset form
  resetForm() {
    // Set tanggal hari ini
    this.setTodayDate();
    
    // Reset jenis aksesoris
    document.getElementById("jenis-aksesoris").value = "Pilih Kategori";
    
    // Reset tabel
    const tbody = document.querySelector("#tableTambahAksesoris tbody");
    tbody.innerHTML = "";
    this.tambahBaris(document.getElementById("jenis-aksesoris").value, tbody);
    
    // Reset total items
    document.getElementById("total-items").textContent = "0";
  },

  // ===== FUNGSI UNTUK MENGELOLA KODE BARANG =====

  // Fungsi untuk menampilkan modal kelola kode
  showKelolaKodeModal() {
    // Load data kode barang untuk kategori default (kotak)
    this.loadKodeBarang("kotak");
    this.modalKelolaKode.show();
  },

  // Fungsi untuk memuat data kode barang dengan caching
  async loadKodeBarang(kategori) {
    try {
      const tableId = kategori === "kotak" ? "tableKodeKotak" : "tableKodeAksesoris";
      const tableBody = document.querySelector(`#${tableId} tbody`);

      if (!tableBody) {
        console.error(`Table body dengan id ${tableId} tidak ditemukan.`);
        return;
      }

      tableBody.innerHTML = '<tr><td colspan="5" class="text-center">Loading...</td></tr>';

      // Check cache
      const now = new Date().getTime();
      const cacheExpiry = 5 * 60 * 1000; // 5 minutes
      
      if (this.cache.kodeAksesoris[kategori] && 
          this.cache.kodeAksesoris.lastFetched && 
          (now - this.cache.kodeAksesoris.lastFetched) < cacheExpiry) {
        
        console.log(`Using cached ${kategori} data`);
        this.renderKodeBarangTable(tableBody, this.cache.kodeAksesoris[kategori], kategori);
        return;
      }

      const snapshot = await getDocs(collection(firestore, "kodeAksesoris", "kategori", kategori));

      if (snapshot.empty) {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center">Tidak ada data</td></tr>';
        return;
      }

      const kodeData = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        kodeData.push({
          id: doc.id,
          text: data.text,
          nama: data.nama
        });
      });
      
      // Update cache
      this.cache.kodeAksesoris[kategori] = kodeData;
      if (!this.cache.kodeAksesoris.lastFetched) {
        this.cache.kodeAksesoris.lastFetched = now;
      }

      // Render table
      this.renderKodeBarangTable(tableBody, kodeData, kategori);
      
    } catch (error) {
      console.error("Error loading kode barang:", error);
      const tableId = kategori === "kotak" ? "tableKodeKotak" : "tableKodeAksesoris";
      const tableBody = document.querySelector(`#${tableId} tbody`);
      if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error: ${error.message}</td></tr>`;
      }
    }
  },
  
  // Render tabel kode barang
  renderKodeBarangTable(tableBody, kodeData, kategori) {
    let html = "";
    let no = 1;

    kodeData.forEach((item) => {
      html += `
        <tr>
          <td>${no++}</td>
          <td>${item.text}</td>
          <td>${item.nama}</td>
          <td>
            <button class="btn btn-warning btn-sm me-1 btn-edit" data-id="${item.id}">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-danger btn-sm btn-delete" data-id="${item.id}">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    });

    tableBody.innerHTML = html;

    // Pasang event listener untuk tombol edit dan delete
    this.attachKodeBarangActionListeners(tableBody, kategori);
  },

  // Fungsi untuk memasang event listener pada tombol aksi kode barang
  attachKodeBarangActionListeners(tableBody, kategori) {
    // Event listener untuk tombol edit
    const editButtons = tableBody.querySelectorAll(".btn-edit");
    editButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const docId = button.getAttribute("data-id");
        this.editKodeBarang(docId, kategori);
      });
    });

    // Event listener untuk tombol delete
    const deleteButtons = tableBody.querySelectorAll(".btn-delete");
    deleteButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const docId = button.getAttribute("data-id");
        this.deleteKodeBarang(docId, kategori);
      });
    });
  },

  // Fungsi untuk menampilkan form modal tambah kode
  showFormKodeModal(kategori, docId = null) {
    // Reset form
    document.getElementById("formKodeBarang").reset();
    document.getElementById("kategoriKode").value = kategori;

    // Set judul modal
    const modalTitle = document.getElementById("modalFormKodeLabel");
    if (modalTitle) {
      modalTitle.textContent = docId ? "Edit Kode Barang" : "Tambah Kode Baru";
    }

    // Jika edit, set docId
    if (docId) {
      document.getElementById("docId").value = docId;
      this.loadKodeBarangData(docId, kategori);
    } else {
      document.getElementById("docId").value = "";
    }

    // Tampilkan modal
    this.modalFormKode.show();
  },

  // Fungsi untuk menyimpan kode barang
  async simpanKodeBarang() {
    // Validasi form
    if (!this.validateKodeBarangForm()) {
      return;
    }

    // Ambil data dari form
    const docId = document.getElementById("docId").value;
    const kategori = document.getElementById("kategoriKode").value;
    const text = document.getElementById("textKode").value;
    const nama = document.getElementById("namaKode").value;

    // Pastikan semua field memiliki nilai valid
    const data = {
      text: text || "",
      nama: nama || "",
    };

    try {
      if (docId) {
        // Update existing document
        await this.updateKodeBarang(docId, kategori, data);
      } else {
        // Add new document
        await this.addKodeBarang(kategori, data);
      }

      // Invalidate cache
      this.cache.kodeAksesoris.lastFetched = null;
      
      // Reload data
      this.modalFormKode.hide();
      this.loadKodeBarang(kategori);

      // Reload kode aksesoris data for the main form
      await this.loadKodeAksesorisData();

      // Update dropdown options if category is active
      const selectKategori = document.getElementById("jenis-aksesoris");
      if (
        selectKategori &&
        ((selectKategori.value === "1" && kategori === "kotak") ||
          (selectKategori.value === "2" && kategori === "aksesoris"))
      ) {
        const tbody = document.querySelector("#tableTambahAksesoris tbody");
        this.handleCategoryChange(selectKategori.value, tbody);
      }
    } catch (error) {
      console.error("Error saving kode barang:", error);
      this.showErrorNotification("Gagal menyimpan data: " + error.message);
    }
  },

  // Fungsi untuk validasi form kode barang
  validateKodeBarangForm() {
    const textKode = document.getElementById('textKode');
    const namaKode = document.getElementById('namaKode');
    
    if (!textKode || !namaKode) {
      console.error("Form elements not found");
      this.showErrorNotification("Terjadi kesalahan: Elemen form tidak ditemukan");
      return false;
    }
    
    const text = textKode.value;
    const nama = namaKode.value;
    
    if (!text || !nama) {
      this.showErrorNotification("Semua field harus diisi!");
      return false;
    }
    
    return true;
  },

  // Fungsi untuk menambah kode barang baru
  async addKodeBarang(kategori, data) {
    try {
      await addDoc(collection(firestore, "kodeAksesoris", "kategori", kategori), data);
      this.showSuccessNotification("Data berhasil ditambahkan!");
    } catch (error) {
      console.error("Error adding kode barang:", error);
      throw error;
    }
  },

  // Fungsi untuk memperbarui kode barang
  async updateKodeBarang(docId, kategori, data) {
    try {
      const docRef = doc(firestore, "kodeAksesoris", "kategori", kategori, docId);
      await updateDoc(docRef, data);
      this.showSuccessNotification("Data berhasil diperbarui!");
    } catch (error) {
      console.error("Error updating kode barang:", error);
      throw error;
    }
  },

  // Fungsi untuk menghapus kode barang
  async deleteKodeBarang(docId, kategori) {
    if (!confirm("Apakah Anda yakin ingin menghapus kode ini?")) {
      return;
    }

    try {
      const docRef = doc(firestore, "kodeAksesoris", "kategori", kategori, docId);
      await deleteDoc(docRef);
      this.showSuccessNotification("Data berhasil dihapus!");

      // Invalidate cache
      this.cache.kodeAksesoris.lastFetched = null;
      
      // Reload data
      this.loadKodeBarang(kategori);

      // Reload kode aksesoris data for the main form
      await this.loadKodeAksesorisData();

      // Update dropdown options if category is active
      const selectKategori = document.getElementById("jenis-aksesoris");
      if (
        selectKategori &&
        ((selectKategori.value === "1" && kategori === "kotak") ||
          (selectKategori.value === "2" && kategori === "aksesoris"))
      ) {
        const tbody = document.querySelector("#tableTambahAksesoris tbody");
        this.handleCategoryChange(selectKategori.value, tbody);
      }
    } catch (error) {
      console.error("Error deleting kode barang:", error);
      this.showErrorNotification("Gagal menghapus data: " + error.message);
    }
  },

  // Fungsi untuk mengedit kode barang
  async editKodeBarang(docId, kategori) {
    this.showFormKodeModal(kategori, docId);
  },
  
  // Fungsi untuk mengatur stok awal hari berikutnya
  async setNextDayStartingStock() {
    try {
      // Ambil semua data stok
      const stockSnapshot = await getDocs(collection(firestore, "stokAksesoris"));
      
      // Update stok awal untuk setiap item
      const batch = firestore.batch();
      
      stockSnapshot.forEach(stockDoc => {
        const stockData = stockDoc.data();
        const docRef = doc(firestore, "stokAksesoris", stockDoc.id);
        
        // Set stok awal = stok akhir hari sebelumnya
        batch.update(docRef, {
          stokAwal: stockData.stokAkhir || 0,
          tambahStok: 0, // Reset tambah stok
          laku: 0, // Reset laku
          free: 0, // Reset free
          gantiLock: 0, // Reset ganti lock
          lastUpdate: serverTimestamp()
        });
      });
      
      // Commit batch update
      await batch.commit();
      console.log("Stok awal hari berikutnya berhasil diatur");
      
      // Invalidate cache
      this.cache.stockData.data = null;
      this.cache.stockData.lastFetched = null;
      
    } catch (error) {
      console.error("Error setting next day starting stock:", error);
      throw error;
    }
  }
};

// Initialize when document is ready
document.addEventListener("DOMContentLoaded", function () {
  aksesorisSaleHandler.init();
  
  // Set up datepicker for filterDate
  $('#filterDate').datepicker({
    format: 'dd/mm/yyyy',
    autoclose: true,
    language: 'id',
    todayHighlight: true
  });
  
  // Calendar icon click handler
  $('#filterDateIcon').on('click', function() {
    $('#filterDate').datepicker('show');
  });
});


      
