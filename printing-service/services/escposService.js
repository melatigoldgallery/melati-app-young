const logger = require('../utils/logger');

class ESCPOSService {
  constructor() {
    // ESC/POS command constants
    this.ESC = '\x1B';
    this.GS = '\x1D';
  }

  /**
   * Generate plain text receipt for TM-U220
   * @param {Object} data - Receipt data
   * @returns {string} Plain text receipt
   */
  generateReceiptCommands(data) {
    const { 
      items = [], 
      totalHarga = 0,
      jumlahBayar = 0, 
      kembalian = 0, 
      sales = '', 
      tanggal = '',
      jam = '',
      metodeBayar = 'tunai',
      nominalDP = 0,
      sisaPembayaran = 0,
      transactionType = 'AKSESORIS'
    } = data;

    let output = '';
    const width = 38; // Character width for 76mm paper

    // Helper function to center text
    const centerText = (text) => {
      const padding = Math.max(0, Math.floor((width - text.length) / 2));
      return ' '.repeat(padding) + text + '\n';
    };

    // Helper function to pad line with right margin
    const padLine = (left, right) => {
      const rightMargin = 4; // Margin from right edge
      const maxWidth = width - rightMargin;
      const spaces = Math.max(1, maxWidth - left.length - right.length);
      return left + ' '.repeat(spaces) + right + '\n';
    };

    // Header - Centered
    output += '\n';
    output += centerText('==================================');
    output += centerText('M E L A T I   3');
    output += centerText('JL. DIPONEGORO NO. 116');
    output += centerText('NOTA PENJUALAN ' + transactionType);
    output += centerText('==================================');
    output += '\n';

    // Transaction info
    output += 'Tanggal: ' + tanggal + '\n';
    output += 'Sales  : ' + sales + '\n';
    output += '==================================\n';

    // Items
    let hasKeterangan = false;
    let keteranganText = '';

    items.forEach((item, index) => {
      const isLastItem = index === items.length - 1;
      
      // Nama barang (uppercase)
      const namaBarang = (item.nama || item.kode || 'Item').toUpperCase();
      output += namaBarang + '\n\n';
      
      // Detail barang
      const kode = item.kode || item.kodeText || '-';
      const kadar = item.kadar || '-';
      const berat = item.berat ? item.berat + 'gr' : '-';
      const harga = this.formatRupiah(item.totalHarga || item.harga || 0);
      
      const detailBarang = kode + '|' + kadar + '|' + berat + `|`;
      output += padLine(detailBarang, harga);
      output += '\n';
      
      // Separator
      if (!isLastItem) {
        output += '- - - - - - - - - - - - - - - - - -\n';
      }
      
      // Collect keterangan
      if (item.keterangan && item.keterangan.trim() !== '') {
        hasKeterangan = true;
        keteranganText += item.keterangan + ' ';
      }
    });

    output += '==================================\n';

    // Total
    output += padLine('TOTAL:', this.formatRupiah(totalHarga));
    output += '==================================\n';
    // Payment details
    if (metodeBayar === 'dp') {
      const dpAmount = parseInt(nominalDP || 0);
      const total = parseInt(totalHarga || 0);
      
      output += padLine('Total Harga:', this.formatRupiah(total));
      output += padLine('DP:', this.formatRupiah(dpAmount));
      
      if (dpAmount >= total) {
        output += centerText('* * *  Lunas  * * *');
      } else {
        const sisa = parseInt(sisaPembayaran || 0);
        output += padLine('Sisa:', this.formatRupiah(sisa));
      }
    } else if (metodeBayar !== 'free') {
      output += padLine('Bayar:', this.formatRupiah(jumlahBayar));
    }

    output += '==================================\n';

    // Keterangan
    if (hasKeterangan) {
      output += '\n';
      output += 'Keterangan:\n';
      output += keteranganText.trim() + '\n';
      output += '==================================\n';
    }

    // Footer - Centered
    output += '\n';
    output += centerText('Terima Kasih');
    output += centerText('Atas Kunjungan Anda');
    output += '\n';
    output += centerText('==================================');
    output += '\n\n\n\n\n';

    return output;
  }

  /**
   * Format rupiah currency
   * @param {number} angka - Amount
   * @returns {string} Formatted currency
   */
  formatRupiah(angka) {
    if (!angka && angka !== 0) return 'Rp 0';
    const number = typeof angka === 'string' ? 
      parseInt(angka.replace(/\./g, '')) : angka;
    return 'Rp ' + new Intl.NumberFormat('id-ID').format(number);
  }

  /**
   * Format payment method label
   * @param {string} metode - Payment method
   * @returns {string} Formatted label
   */
  formatMetodeBayar(metode) {
    const mapping = {
      'tunai': 'Tunai',
      'dp': 'Down Payment (DP)',
      'free': 'Gratis'
    };
    return mapping[metode] || metode;
  }
}

module.exports = new ESCPOSService();
