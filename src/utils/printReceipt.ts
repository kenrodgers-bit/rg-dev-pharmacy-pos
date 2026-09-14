import { ReceiptSettings, SaleTransaction } from '../types';
import { formatKSh } from './currency';

/**
 * Triggers direct thermal printing of a receipt without displaying an in-app modal dialogue.
 * Utilizes a temporary hidden iframe so the main UI view remains uninterrupted.
 */
export function directPrintReceipt(
  transaction: SaleTransaction,
  settings: ReceiptSettings
): Promise<boolean> {
  return new Promise((resolve) => {
    if (settings.enableReceiptPrinting === false) {
      resolve(false);
      return;
    }

    try {
      const is58mm = settings.paperWidth === '58mm';
      const widthClass = is58mm ? '58mm' : '80mm';
      const widthPx = is58mm ? 220 : 300;
      const isPartial = transaction.paymentMethod === 'Partial (Cash + M-Pesa)';
      const isShowLogo = (settings.showLogo ?? true) && Boolean(settings.logoUrl);
      const logoHeight = settings.logoHeight || 44;

      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0px';
      iframe.style.height = '0px';
      iframe.style.border = 'none';
      iframe.setAttribute('title', 'Direct Receipt Thermal Print');

      document.body.appendChild(iframe);

      const itemsHtml = transaction.items
        .map((it) => {
          return `
          <div style="margin-bottom: 4px; padding-bottom: 3px; border-bottom: 1px dashed #e2e8f0;">
            <div style="display: flex; justify-content: space-between; font-weight: 600; font-size: 11px;">
              <span>${it.name}</span>
              <span>${formatKSh(it.totalPrice)}</span>
            </div>
            ${
              settings.showGenericName && it.genericName
                ? `<div style="font-size: 9px; color: #64748b;">${it.genericName}</div>`
                : ''
            }
            <div style="display: flex; justify-content: space-between; font-size: 9.5px; color: #475569;">
              <span>${it.quantity} x ${formatKSh(it.unitPrice)}</span>
              ${it.rxNumber ? `<span style="font-weight: 700; color: #0f766e;">Rx #${it.rxNumber}</span>` : ''}
            </div>
            ${
              settings.showBatchAndExpiry && it.batchNumber && it.batchNumber !== 'N/A'
                ? `<div style="font-size: 8.5px; color: #64748b;">Lot: ${it.batchNumber} | Exp: ${it.expiryDate}</div>`
                : ''
            }
          </div>
        `;
        })
        .join('');

      const content = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8" />
          <title>Receipt #${transaction.receiptNumber}</title>
          <style>
            @page {
              size: ${widthClass} auto;
              margin: 0;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", monospace;
              margin: 0;
              padding: 8px;
              width: ${widthPx}px;
              color: #0f172a;
              background: #ffffff;
              font-size: 10px;
              line-height: 1.35;
            }
            .center { text-align: center; }
            .bold { font-weight: 700; }
            .divider { border-top: 1px dashed #94a3b8; margin: 6px 0; }
            .divider-double { border-top: 2px solid #0f172a; margin: 6px 0; }
            .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
            .title { font-size: 13px; font-weight: 800; margin-bottom: 2px; }
            .meta { font-size: 9px; color: #475569; }
            .total-row { font-size: 13px; font-weight: 800; margin: 4px 0; }
          </style>
        </head>
        <body>
          <div class="center">
            ${
              isShowLogo
                ? `<img src="${settings.logoUrl}" style="max-height: ${logoHeight}px; margin-bottom: 4px;" alt="Logo" />`
                : ''
            }
            <div class="title">${settings.pharmacyName}</div>
            ${settings.tagline ? `<div class="meta" style="font-style: italic;">${settings.tagline}</div>` : ''}
            <div class="meta">${settings.addressLine1}</div>
            ${settings.addressLine2 ? `<div class="meta">${settings.addressLine2}</div>` : ''}
            <div class="meta">Tel: ${settings.phone}</div>
            ${settings.licenseNumber ? `<div class="meta">${settings.licenseNumber}</div>` : ''}
            ${settings.taxId ? `<div class="meta">${settings.taxId}</div>` : ''}
            ${settings.headerMessage ? `<div class="meta" style="margin-top: 3px; font-weight: 600;">${settings.headerMessage}</div>` : ''}
          </div>

          <div class="divider-double"></div>

          <div class="row">
            <span class="bold">Receipt:</span>
            <span class="bold">#${transaction.receiptNumber}</span>
          </div>
          <div class="row meta">
            <span>Date:</span>
            <span>${new Date(transaction.timestamp).toLocaleString()}</span>
          </div>
          ${
            settings.showPharmacistName
              ? `<div class="row meta">
                  <span>Cashier:</span>
                  <span>${transaction.cashierName} (${transaction.cashierRole})</span>
                </div>`
              : ''
          }
          <div class="row meta">
            <span>Payment:</span>
            <span class="bold">${transaction.paymentMethod}</span>
          </div>
          ${
            transaction.patientName
              ? `<div class="row meta">
                  <span>Patient:</span>
                  <span class="bold">${transaction.patientName}</span>
                </div>`
              : ''
          }
          ${
            transaction.mpesaReference
              ? `<div class="row meta">
                  <span>M-Pesa Ref:</span>
                  <span class="bold">${transaction.mpesaReference}</span>
                </div>`
              : ''
          }
          ${
            transaction.cardAuthCode
              ? `<div class="row meta">
                  <span>Card Auth:</span>
                  <span>${transaction.cardAuthCode}</span>
                </div>`
              : ''
          }
          ${
            transaction.insuranceAuthCode
              ? `<div class="row meta">
                  <span>Claim Pre-Auth:</span>
                  <span>${transaction.insuranceAuthCode}</span>
                </div>`
              : ''
          }

          <div class="divider"></div>

          <div style="margin-bottom: 4px;">
            ${itemsHtml}
          </div>

          <div class="divider"></div>

          <div class="row meta">
            <span>Subtotal:</span>
            <span>${formatKSh(transaction.subtotal)}</span>
          </div>
          ${
            settings.showTaxBreakdown && transaction.tax > 0
              ? `<div class="row meta">
                  <span>Tax (Included):</span>
                  <span>${formatKSh(transaction.tax)}</span>
                </div>`
              : ''
          }
          ${
            transaction.discount > 0
              ? `<div class="row meta" style="color: #059669;">
                  <span>Discount:</span>
                  <span>-${formatKSh(transaction.discount)}</span>
                </div>`
              : ''
          }

          <div class="row total-row">
            <span>TOTAL:</span>
            <span>${formatKSh(transaction.total)}</span>
          </div>

          ${
            isPartial
              ? `<div class="row meta">
                  <span>Cash Paid:</span>
                  <span>${formatKSh(transaction.cashAmount || 0)}</span>
                </div>
                <div class="row meta">
                  <span>M-Pesa Paid:</span>
                  <span>${formatKSh(transaction.mpesaAmount || 0)}</span>
                </div>`
              : ''
          }
          ${
            transaction.amountTendered && transaction.paymentMethod === 'Cash'
              ? `<div class="row meta">
                  <span>Cash Tendered:</span>
                  <span>${formatKSh(transaction.amountTendered)}</span>
                </div>`
              : ''
          }
          ${
            transaction.changeDue !== undefined && transaction.changeDue > 0
              ? `<div class="row meta bold">
                  <span>Change Due:</span>
                  <span>${formatKSh(transaction.changeDue)}</span>
                </div>`
              : ''
          }

          <div class="divider-double"></div>

          <div class="center meta" style="margin-top: 6px;">
            ${settings.footerMessage ? `<div>${settings.footerMessage}</div>` : ''}
            ${settings.returnPolicy ? `<div style="font-size: 8px; margin-top: 3px; color: #64748b;">${settings.returnPolicy}</div>` : ''}
            ${settings.emergencyPhone ? `<div style="font-size: 8.5px; font-weight: 600; margin-top: 3px;">${settings.emergencyPhone}</div>` : ''}
          </div>
        </body>
        </html>
      `;

      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(content);
        doc.close();

        // Allow styles & images to parse then print
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            resolve(true);
          } catch (printErr) {
            console.warn('Auto print failed:', printErr);
            resolve(false);
          } finally {
            setTimeout(() => {
              document.body.removeChild(iframe);
            }, 2000);
          }
        }, 150);
      } else {
        resolve(false);
      }
    } catch (e) {
      console.error('Error during directPrintReceipt:', e);
      resolve(false);
    }
  });
}
