// ===============================
// ADD THESE IMPORTS AT TOP
// ===============================

import jsPDF from "jspdf";
import html2canvas from "html2canvas";


// ===============================
// ADD THESE FUNCTIONS INSIDE APP()
// ===============================

const downloadClientPDF = async () => {
  const input = document.getElementById("client-quote");

  if (!input) return;

  const canvas = await html2canvas(input, {
    scale: 2,
    useCORS: true,
  });

  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF("p", "mm", "a4");

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

  pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);

  pdf.save("BevHub_Client_Quote.pdf");
};

const downloadInternalPDF = async () => {
  const input = document.getElementById("internal-financials");

  if (!input) return;

  const canvas = await html2canvas(input, {
    scale: 2,
    useCORS: true,
  });

  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF("p", "mm", "a4");

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

  pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);

  pdf.save("BevHub_Internal_Financials.pdf");
};


// ===============================
// CLIENT VIEW SECTION
// WRAP CLIENT AREA
// ===============================

<div id="client-quote">

  {/* CLIENT SAFE CONTENT */}

  <div className="grid grid-cols-2 gap-4">

    <Output
      label="Tolling"
      value={`$${money(result.tolling, 4)} / can`}
    />

    <Output
      label="Estimated Total"
      value={`$${money(result.pricePerCase, 2)} / case`}
    />

    <Output
      label="Materials"
      value={`$${money(result.materialsPerCan, 4)} / can`}
    />

    <Output
      label="Recommended Increase"
      value={`${(result.recommendedIncreasePct * 100).toFixed(1)}%`}
    />

  </div>

</div>


// ===============================
// INTERNAL VIEW SECTION
// WRAP INTERNAL FINANCIALS
// ===============================

<div id="internal-financials">

  {/* FULL INTERNAL FINANCIALS */}

  <div className="grid grid-cols-2 gap-4">

    <Output
      label="Operational Grade"
      value={result.operationalGrade}
    />

    <Output
      label="OH Result"
      value={`${(result.ohResultPct * 100).toFixed(2)}%`}
    />

    <Output
      label="After Supplies"
      value={`${(result.afterSuppliesPct * 100).toFixed(2)}%`}
    />

    <Output
      label="Weekly Revenue"
      value={`$${money(result.weeklyRevenue, 2)}`}
    />

    <Output
      label="Estimated Weekly Net"
      value={`$${money(result.estimatedWeeklyNetIncome, 2)}`}
    />

    <Output
      label="Estimated Whole Run Net"
      value={`$${money(result.estimatedWholeRunNet, 2)}`}
    />

  </div>

</div>


// ===============================
// REPLACE BUTTON SECTION
// ===============================

<div className="grid grid-cols-2 md:grid-cols-3 gap-4">

  <button
    onClick={downloadClientPDF}
    className="rounded-xl border p-4 font-semibold"
  >
    Download Client PDF
  </button>

  <button
    onClick={() => window.print()}
    className="rounded-xl border p-4 font-semibold"
  >
    Print Client Quote
  </button>

  <button
    onClick={downloadInternalPDF}
    className="rounded-xl border p-4 font-semibold"
  >
    Download Internal Financials
  </button>

  <button
    onClick={() => window.print()}
    className="rounded-xl border p-4 font-semibold"
  >
    Print Internal Financials
  </button>

  <button
    onClick={downloadInternalSummary}
    className="rounded-xl border p-4 font-semibold"
  >
    Download Internal Text
  </button>

  <button
    onClick={exportCSV}
    className="rounded-xl border p-4 font-semibold"
  >
    Export CSV
  </button>

</div>


// ===============================
// RUN THIS IN TERMINAL
// ===============================

npm install jspdf html2canvas


// ===============================
// THEN:
// ===============================

1. Commit changes
2. Push to GitHub
3. Cloudflare auto deploys
4. Hard refresh browser:
   CTRL + SHIFT + R


// ===============================
// FINAL RESULT
// ===============================

You will now have:

- Download Client PDF
- Download Internal Financials PDF
- Print Client Quote
- Print Internal Financials
- Clean client-safe exports
- Hidden internal profitability data from client PDFs
- Real downloadable PDFs instead of browser print preview
