// stockTabManager.js
export class StockTabManager {
    constructor() {
        this.mainCategories = ["KALUNG", "LIONTIN", "ANTING", "CINCIN", "HALA", "GELANG", "GIWANG"];
        this.subCategories = ["Stok Brankas", "Belum Posting", "Display", "Rusak", "Batu Lepas", "Manual", "Admin"];
        this.initializeTabs();
    }

    initializeTabs() {
        const template = document.getElementById('categoryTabTemplate');
        const container = document.getElementById('dynamicTabContent');
        
        if (!template || !container) {
            console.error('Required elements not found');
            return;
        }

        // Clear existing content
        container.innerHTML = '';

        // Create tab content for each category
        this.mainCategories.forEach((category, index) => {
            const clone = template.content.cloneNode(true);
            const tabPane = clone.querySelector('.tab-pane');
            
            // Set attributes
            tabPane.id = this.getCategoryId(category);
            tabPane.setAttribute('aria-labelledby', `${this.getCategoryId(category)}-tab`);
            if (index === 0) {
                tabPane.classList.add('show', 'active');
            }

            // Set category title
            const title = clone.querySelector('h3');
            if (title) {
                title.textContent = category;
            }

            // Add to container
            container.appendChild(clone);
        });
    }

    getCategoryId(category) {
        return category.toLowerCase().replace(/\s+/g, '-');
    }

    updateTabContent(category, stockData) {
        const tableBody = document.querySelector(`#${this.getCategoryId(category)} .category-table-body`);
        if (!tableBody) return;

        tableBody.innerHTML = '';

        // Add rows for each subcategory
        this.subCategories.forEach(subCategory => {
            const stockInfo = stockData[this.getCategoryKey(subCategory)]?.[category] || { quantity: 0, lastUpdated: null };
            const row = this.createStockRow(category, subCategory, stockInfo);
            tableBody.appendChild(row);
        });
    }

    createStockRow(category, subCategory, stockInfo) {
        const tr = document.createElement('tr');
        const quantity = stockInfo.quantity || 0;
        const lastUpdated = stockInfo.lastUpdated ? this.formatDate(stockInfo.lastUpdated) : '-';
        const quantityClass = this.getQuantityBadgeClass(quantity);

        tr.innerHTML = `
            <td class="text-left">${subCategory}</td>
            <td class="text-center"><span class="badge ${quantityClass}">${quantity}</span></td>
            <td class="text-center">${lastUpdated}</td>
            <td class="text-center">
                <button class="btn btn-sm btn-primary" onclick="editStock('${category}', '${this.getCategoryKey(subCategory)}', ${quantity})">
                    <i class="fas fa-edit"></i>
                </button>
            </td>
        `;

        return tr;
    }

    getCategoryKey(subCategory) {
        const mapping = {
            "Stok Brankas": "brankas",
            "Belum Posting": "posting",
            "Display": "barang-display",
            "Rusak": "barang-rusak",
            "Batu Lepas": "batu-lepas",
            "Manual": "manual",
            "Admin": "admin"
        };
        return mapping[subCategory] || "";
    }

    getQuantityBadgeClass(quantity) {
        if (quantity === 0) return 'bg-danger';
        if (quantity <= 5) return 'bg-warning';
        if (quantity >= 20) return 'bg-success';
        return 'bg-primary';
    }

    formatDate(date) {
        if (!date) return '-';
        const d = new Date(date);
        return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
    }
}
