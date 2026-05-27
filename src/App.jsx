"use client";

import React, { useMemo, useState } from "react";

const CAPACITY_12_PACK = 75000;
const CAPACITY_24_PACK = 37500;
const RUN_WEEKS_PER_YEAR = 48;
const DEFAULT_LOW_WEEKLY_OH = 250000;
const DEFAULT_HIGH_WEEKLY_OH = 350000;
const DEFAULT_COGS_BUFFER = 0.1;
const TARGET_GRADE_THRESHOLD = 0.1;

const materialDefaults = {
  "12 oz Sleek": { canEnd: 0.15524, tray12: 0.139, tray24: 0.285 },
  "250 ml Slim": { canEnd: 0.1681, tray12: 0.142, tray24: 0.2544 },
  "7.5 oz": { canEnd: 0.1545, tray12: 0.139, tray24: 0.285 },
  "16 oz": { canEnd: 0.2076, tray12: 0.139, tray24: 0.285 },
};

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value, decimals = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value || 0);
}

function whole(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value || 0);
}

function pct(value) {
  return `${((value || 0) * 100).toFixed(1)}%`;
}

function modeLabel(mode) {
  if (mode === "additional") return "Additional cost";
  if (mode === "included") return "Included in tolling";
  if (mode === "clientSupplied") return "Client supplied";
  return "Not needed";
}

function getWeeklyCapacity(casePack, weeklyOutput12Pack, weeklyOutput24Pack) {
  return Number(casePack) === 24
    ? Math.max(toNumber(weeklyOutput24Pack, CAPACITY_24_PACK), 1)
    : Math.max(toNumber(weeklyOutput12Pack, CAPACITY_12_PACK), 1);
}

function additionalCost(mode, cost) {
  return mode === "additional" ? cost : 0;
}

function includedCost(mode, cost) {
  return mode === "included" ? cost : 0;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
}

function getCustomTermLines(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function calculateQuote(input) {
  const annualCases = Math.max(toNumber(input.annualCases, 0), 0);
  const runsPerYear = Math.max(toNumber(input.runsPerYear, 1), 1);
  const skuCount = Math.max(toNumber(input.skuCount, 1), 1);
  const casePack = Math.max(toNumber(input.casePack, 12), 1);
  const tolling = Math.max(toNumber(input.tolling, 0), 0);
  const casesPerPallet = Math.max(toNumber(input.casesPerPallet, 1), 1);
  const lowWeeklyOH = Math.max(toNumber(input.lowWeeklyOH, DEFAULT_LOW_WEEKLY_OH), 1);
  const highWeeklyOH = Math.max(toNumber(input.highWeeklyOH, DEFAULT_HIGH_WEEKLY_OH), 1);
  const cogsBuffer = Math.max(toNumber(input.cogsBuffer, DEFAULT_COGS_BUFFER), 0);
  const selected = materialDefaults[input.canSize] || materialDefaults["12 oz Sleek"];
  const weeklyOutput12Pack = Math.max(toNumber(input.weeklyOutput12Pack, CAPACITY_12_PACK), 1);
  const weeklyOutput24Pack = Math.max(toNumber(input.weeklyOutput24Pack, CAPACITY_24_PACK), 1);

  const maxWeeklyCases = getWeeklyCapacity(casePack, weeklyOutput12Pack, weeklyOutput24Pack);
  const annualCapacity = maxWeeklyCases * RUN_WEEKS_PER_YEAR;
  const casesPerRun = annualCases / runsPerYear;
  const casesPerSkuPerRun = casesPerRun / skuCount;
  const cansPerYear = annualCases * casePack;
  const weeksPerRun = casesPerRun / maxWeeklyCases;
  const utilization = annualCapacity > 0 ? annualCases / annualCapacity : 0;

  const canEndUnit = toNumber(input.canEndCostPerCan, selected.canEnd);
  const trayCaseDefault = casePack === 24 ? selected.tray24 : selected.tray12;
  const trayUnit = toNumber(input.trayCostPerCase, trayCaseDefault) / casePack;
  const caseLabelUnit = toNumber(input.caseLabelCostPerCase, 0.011) / casePack;
  const palletUnit = toNumber(input.palletMaterialCostPerPallet, 13.03) / casesPerPallet / casePack;
  const sleeveUnit = toNumber(input.sleeveCostPerCan, 0.1);
  const cartonUnit = toNumber(input.cartonCostPerCan, 0.0225);

  const canEndCost = additionalCost(input.canEndMode, canEndUnit);
  const trayCost = additionalCost(input.trayMode, trayUnit);
  const caseLabelCost = additionalCost(input.caseLabelMode, caseLabelUnit);
  const palletCost = additionalCost(input.palletMode, palletUnit);
  const sleeveCost = additionalCost(input.sleeveMode, sleeveUnit);
  const cartonCost = additionalCost(input.cartonMode, cartonUnit);

  const includedInToll =
    includedCost(input.canEndMode, canEndUnit) +
    includedCost(input.trayMode, trayUnit) +
    includedCost(input.caseLabelMode, caseLabelUnit) +
    includedCost(input.palletMode, palletUnit) +
    includedCost(input.sleeveMode, sleeveUnit) +
    includedCost(input.cartonMode, cartonUnit);

  const materialsPerCan = canEndCost + trayCost + caseLabelCost + palletCost;
  const servicesPerCan = sleeveCost + cartonCost;
  const pricePerCan = tolling + materialsPerCan + servicesPerCan;
  const pricePerCase = pricePerCan * casePack;

  const productionWeeksPerYear = Math.max(runsPerYear, 1);
  const weeklyCasesForProfit = annualCases / productionWeeksPerYear;
  const weeklyCansForProfit = weeklyCasesForProfit * casePack;
  const weeklyRevenue = weeklyCansForProfit * pricePerCan;
  const weeklyCogsBase = weeklyCansForProfit * (materialsPerCan + servicesPerCan);
  const weeklyCogsEstimate = weeklyCogsBase * (1 + cogsBuffer);
  const estimatedWeeklyNet = weeklyRevenue - lowWeeklyOH - weeklyCogsEstimate;
  const estimatedWholeRunNet = estimatedWeeklyNet * productionWeeksPerYear;
  const ohResultPct = lowWeeklyOH > 0 ? estimatedWeeklyNet / lowWeeklyOH : 0;
  const afterSuppliesPct = lowWeeklyOH > 0 ? estimatedWeeklyNet / lowWeeklyOH : 0;

  let operationalGrade = "Losing Money";
  let gradeThreshold = -0.01;
  if (ohResultPct >= 0.3) {
    operationalGrade = "Amazing";
    gradeThreshold = 0.3;
  } else if (ohResultPct >= 0.2) {
    operationalGrade = "Great";
    gradeThreshold = 0.2;
  } else if (ohResultPct >= 0.1) {
    operationalGrade = "Good";
    gradeThreshold = 0.1;
  } else if (ohResultPct >= 0.05) {
    operationalGrade = "Better";
    gradeThreshold = 0.05;
  } else if (ohResultPct >= 0) {
    operationalGrade = "Covering";
    gradeThreshold = 0;
  }

  const requiredTotalPriceForGood = weeklyCansForProfit > 0 ? ((lowWeeklyOH * (1 + TARGET_GRADE_THRESHOLD)) + weeklyCogsEstimate) / weeklyCansForProfit : 0;
  const recommendedTolling = Math.max(requiredTotalPriceForGood - materialsPerCan - servicesPerCan, 0);
  const recommendedIncreasePct = tolling > 0 ? Math.max((recommendedTolling - tolling) / tolling, 0) : 0;
  const tollingCoverageRatio = recommendedTolling > 0 ? tolling / recommendedTolling : 0;

  let status = "Healthy";
  let statusNote = "Production cadence appears reasonable based on the selected case pack and annual volume.";
  if (weeksPerRun < 1) {
    status = "Cadence Review";
    statusNote = "Each run is below one full production week. Consider a cadence adder or consolidating volume into fewer runs.";
  } else if (tolling < recommendedTolling) {
    status = "Pricing Review";
    statusNote = "Entered tolling is below the recommended tolling estimate based on volume, cadence, and SKU count.";
  }

  return {
    annualCases,
    runsPerYear,
    skuCount,
    casePack,
    casesPerRun,
    casesPerSkuPerRun,
    cansPerYear,
    maxWeeklyCases,
    annualCapacity,
    weeksPerRun,
    utilization,
    tolling,
    recommendedTolling,
    recommendedIncreasePct,
    tollingCoverageRatio,
    operationalGrade,
    gradeThreshold,
    lowWeeklyOH,
    highWeeklyOH,
    cogsBuffer,
    productionWeeksPerYear,
    weeklyCasesForProfit,
    weeklyCansForProfit,
    weeklyRevenue,
    weeklyCogsEstimate,
    estimatedWeeklyNet,
    estimatedWholeRunNet,
    ohResultPct,
    afterSuppliesPct,
    weeklyOutput12Pack,
    weeklyOutput24Pack,
    canEndCost,
    trayCost,
    caseLabelCost,
    palletCost,
    sleeveCost,
    cartonCost,
    materialsPerCan,
    servicesPerCan,
    includedInToll,
    pricePerCan,
    pricePerCase,
    annualRevenue: pricePerCan * cansPerYear,
    status,
    statusNote,
  };
}

const testInput = {
  annualCases: "70000",
  runsPerYear: "1",
  skuCount: "1",
  casePack: "12",
  canSize: "12 oz Sleek",
  tolling: "0.33",
  casesPerPallet: "182",
  canEndMode: "additional",
  trayMode: "additional",
  caseLabelMode: "additional",
  palletMode: "additional",
  sleeveMode: "notNeeded",
  cartonMode: "notNeeded",
  sleeveCostPerCan: "0.10",
  cartonCostPerCan: "0.0225",
  canEndCostPerCan: "0.15524",
  trayCostPerCase: "0.139",
  caseLabelCostPerCase: "0.011",
  palletMaterialCostPerPallet: "13.03",
};

function csvEscape(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function csvRowsToText(rows) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function runTests() {
  const tests = [];
  const base = calculateQuote(testInput);
  tests.push({ name: "75,000 12-pack cases equals 1 production week", pass: Math.abs(calculateQuote({ ...testInput, annualCases: "75000" }).weeksPerRun - 1) < 0.0001 });
  tests.push({ name: "37,500 24-pack cases equals 1 production week", pass: Math.abs(calculateQuote({ ...testInput, casePack: "24", annualCases: "37500" }).weeksPerRun - 1) < 0.0001 });
  tests.push({ name: "12-pack case conversion is accurate", pass: base.cansPerYear === 840000 });
  tests.push({ name: "Price per case equals price per can times case pack", pass: Math.abs(base.pricePerCase - base.pricePerCan * 12) < 0.0001 });
  tests.push({ name: "Client supplied cans remove can and end cost", pass: calculateQuote({ ...testInput, canEndMode: "clientSupplied" }).canEndCost === 0 });
  tests.push({ name: "Included trays roll into tolling and not additional materials", pass: calculateQuote({ ...testInput, trayMode: "included" }).trayCost === 0 });
  tests.push({ name: "Not needed carton removes carton application cost", pass: calculateQuote({ ...testInput, cartonMode: "notNeeded" }).cartonCost === 0 });
  tests.push({ name: "Custom sleeve override works", pass: Math.abs(calculateQuote({ ...testInput, sleeveMode: "additional", sleeveCostPerCan: "0.125" }).sleeveCost - 0.125) < 0.0001 });
  tests.push({ name: "Custom tray override works", pass: Math.abs(calculateQuote({ ...testInput, trayCostPerCase: "0.240" }).trayCost - 0.02) < 0.0001 });
  tests.push({ name: "Included tolling cost is tracked", pass: calculateQuote({ ...testInput, canEndMode: "included" }).includedInToll > 0 });
  tests.push({ name: "Quote text line breaks are export safe", pass: ["A", "B"].join("\n") === "A\nB" });
  tests.push({ name: "CSV export line breaks are safe", pass: csvRowsToText([["A", "B"], ["C", "D"]]) === '"A","B"\n"C","D"' });
  tests.push({ name: "HTML escaping preserves custom terms safely", pass: escapeHtml("A&B\n<C>") === "A&amp;B<br/>&lt;C&gt;" });
  tests.push({ name: "Custom terms split into starred lines", pass: getCustomTermLines("One\nTwo\n").length === 2 });
  return tests;
}

export default function BevHubQuoteCalculator() {
  const [clientName, setClientName] = useState("Client Name");
  const [annualCases, setAnnualCases] = useState("70000");
  const [runsPerYear, setRunsPerYear] = useState("4");
  const [skuCount, setSkuCount] = useState("1");
  const [casePack, setCasePack] = useState("12");
  const [canSize, setCanSize] = useState("12 oz Sleek");
  const [tolling, setTolling] = useState("0.33");
  const [casesPerPallet, setCasesPerPallet] = useState("182");
  const [canEndMode, setCanEndMode] = useState("additional");
  const [trayMode, setTrayMode] = useState("additional");
  const [caseLabelMode, setCaseLabelMode] = useState("additional");
  const [palletMode, setPalletMode] = useState("additional");
  const [sleeveMode, setSleeveMode] = useState("notNeeded");
  const [cartonMode, setCartonMode] = useState("notNeeded");
  const [sleeveCostPerCan, setSleeveCostPerCan] = useState("0.10");
  const [cartonCostPerCan, setCartonCostPerCan] = useState("0.0225");
  const [canEndCostPerCan, setCanEndCostPerCan] = useState("0.15524");
  const [trayCostPerCase, setTrayCostPerCase] = useState("0.139");
  const [caseLabelCostPerCase, setCaseLabelCostPerCase] = useState("0.011");
  const [palletMaterialCostPerPallet, setPalletMaterialCostPerPallet] = useState("13.03");
  const [weeklyOutput12Pack, setWeeklyOutput12Pack] = useState("75000");
  const [weeklyOutput24Pack, setWeeklyOutput24Pack] = useState("37500");
  const [lowWeeklyOH, setLowWeeklyOH] = useState("250000");
  const [highWeeklyOH, setHighWeeklyOH] = useState("350000");
  const [cogsBuffer, setCogsBuffer] = useState("0.10");
  const [customTerms, setCustomTerms] = useState("");

  const input = {
    annualCases,
    runsPerYear,
    skuCount,
    casePack,
    canSize,
    tolling,
    casesPerPallet,
    canEndMode,
    trayMode,
    caseLabelMode,
    palletMode,
    sleeveMode,
    cartonMode,
    sleeveCostPerCan,
    cartonCostPerCan,
    canEndCostPerCan,
    trayCostPerCase,
    caseLabelCostPerCase,
    palletMaterialCostPerPallet,
    weeklyOutput12Pack,
    weeklyOutput24Pack,
    lowWeeklyOH,
    highWeeklyOH,
    cogsBuffer,
  };

  const result = useMemo(() => calculateQuote(input), [
    annualCases,
    runsPerYear,
    skuCount,
    casePack,
    canSize,
    tolling,
    casesPerPallet,
    canEndMode,
    trayMode,
    caseLabelMode,
    palletMode,
    sleeveMode,
    cartonMode,
    sleeveCostPerCan,
    cartonCostPerCan,
    canEndCostPerCan,
    trayCostPerCase,
    caseLabelCostPerCase,
    palletMaterialCostPerPallet,
    weeklyOutput12Pack,
    weeklyOutput24Pack,
    lowWeeklyOH,
    highWeeklyOH,
    cogsBuffer,
  ]);

  const tests = useMemo(() => runTests(), []);
  const customTermLines = getCustomTermLines(customTerms);
  const customTermsHtml = customTermLines.map((line) => `<p>*${escapeHtml(line)}</p>`).join("");

  const quoteText = [
    "Pricing Quote Summary",
    `Client: ${clientName}`,
    `Package: ${canSize}`,
    `Case Pack: ${result.casePack} pack`,
    `Annual Volume: ${whole(result.annualCases)} cases`,
    `Runs Per Year: ${result.runsPerYear}`,
    `Cases Per Run: ${whole(result.casesPerRun)}`,
    `Tolling: ${money(result.tolling, 4)} / can`,
    `Materials and Packaging: ${money(result.materialsPerCan, 4)} / can`,
    `Additional Services: ${money(result.servicesPerCan, 4)} / can`,
    `Estimated Total: ${money(result.pricePerCan, 4)} / can`,
    `Estimated Total: ${money(result.pricePerCase, 2)} / case`,
    `Cans + Ends: ${modeLabel(canEndMode)}`,
    `Trays: ${modeLabel(trayMode)}`,
    `Sleeve Application: ${modeLabel(sleeveMode)}`,
    `Carton Application: ${modeLabel(cartonMode)}`,
    `Case Labels: ${modeLabel(caseLabelMode)}`,
    `Pallet Materials: ${modeLabel(palletMode)}`,
    `Operational Grade: ${result.operationalGrade}`,
    `Recommended Increase: ${(result.recommendedIncreasePct * 100).toFixed(1)}%`,
    customTermLines.length ? `Custom Terms:\n${customTermLines.map((line) => `*${line}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");

  const clientQuoteHtml = `<!doctype html><html><head><title>Manufacturing Quote - ${escapeHtml(clientName)}</title><style>body{font-family:Calibri,Arial,sans-serif;color:#0f172a;padding:32px}.page{max-width:850px;margin:0 auto;border:1px solid #cbd5e1;padding:36px}h1{font-size:30px;margin:0}h2{font-size:18px;border-bottom:1px solid #cbd5e1;padding-bottom:6px;margin-top:28px}.muted{color:#64748b;font-size:13px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:28px}.line{display:flex;justify-content:space-between;gap:24px;padding:3px 0;font-size:14px}.strong{font-weight:700}.notes{border-top:1px solid #cbd5e1;margin-top:28px;padding-top:18px;font-size:12px;line-height:1.55;color:#475569}.signature{display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-top:32px;font-size:14px}.sigline{border-bottom:1px solid #475569;height:24px;margin-bottom:18px}@media print{body{padding:0}.page{border:none}}</style></head><body><div class="page"><h1>Manufacturing Quote</h1><div class="muted">Shelf-stable beverage production estimate</div><div class="grid" style="margin-top:20px;"><div class="line"><span>Client</span><span class="strong">${escapeHtml(clientName)}</span></div><div class="line"><span>Package</span><span class="strong">${escapeHtml(canSize)}</span></div><div class="line"><span>Case Pack</span><span class="strong">${result.casePack} pack</span></div></div><div class="grid"><div><h2>Volume Assumptions</h2><div class="line"><span>Annual Volume</span><span class="strong">${whole(result.annualCases)} cases</span></div><div class="line"><span>Runs Per Year</span><span class="strong">${result.runsPerYear}</span></div><div class="line"><span>Cases Per Run</span><span class="strong">${whole(result.casesPerRun)}</span></div><div class="line"><span>Production Time Per Run</span><span class="strong">${result.weeksPerRun.toFixed(2)} weeks</span></div></div><div><h2>Pricing Estimate</h2><div class="line"><span>Tolling</span><span class="strong">${money(result.tolling, 4)} / can</span></div><div class="line"><span>Materials and Packaging</span><span class="strong">${money(result.materialsPerCan, 4)} / can</span></div><div class="line"><span>Additional Services</span><span class="strong">${money(result.servicesPerCan, 4)} / can</span></div><div class="line"><span>Estimated Total</span><span class="strong">${money(result.pricePerCan, 4)} / can</span></div><div class="line"><span>Estimated Total</span><span class="strong">${money(result.pricePerCase, 2)} / case</span></div></div></div><h2>Materials and Services</h2><div class="grid"><div class="line"><span>Cans and Ends</span><span class="strong">${modeLabel(canEndMode)}</span></div><div class="line"><span>Trays</span><span class="strong">${modeLabel(trayMode)}</span></div><div class="line"><span>Case Labels</span><span class="strong">${modeLabel(caseLabelMode)}</span></div><div class="line"><span>Pallet Materials</span><span class="strong">${modeLabel(palletMode)}</span></div><div class="line"><span>Sleeve Application</span><span class="strong">${modeLabel(sleeveMode)}</span></div><div class="line"><span>Carton Application</span><span class="strong">${modeLabel(cartonMode)}</span></div></div><div class="notes"><p>*This quote is based on the production scope, packaging configuration, and assumptions outlined above. Final pricing is subject to confirmation of product specifications, packaging requirements, production schedule, and executed commercial agreement.</p><p>*Acceptance of this quotation constitutes the client's obligation to issue a production purchase order (PO) for each authorized production run.</p><p>*Bev-Hub has not produced this product previously and pricing is based on the information provided during the quoting process.</p><p>*Bev-Hub will manufacture strictly to the client-approved formulation and specifications. Bev-Hub assumes no responsibility for formulation performance, stability, or market outcomes, provided production is completed without human error or equipment malfunction.</p><p>*Standard commercialization through Process Authority is estimated at $3,000 per SKU.</p>${customTermsHtml}<h2>Warehousing</h2><p>Pallets In: $15 / pallet raw goods<br/>Cold Storage: $20 / pallet<br/>Pallets Out: $8 / pallet finished goods<br/>Pallet Storage: $15 / pallet per month</p></div><div class="signature"><div><div>Client</div><div class="sigline"></div><div>Name</div><div class="sigline"></div><div>PO Number</div><div class="sigline"></div></div><div><div>Bev-Hub</div><div class="sigline"></div><div>Name</div><div class="sigline"></div></div></div></div></body></html>`;

  const internalSummaryText = [
    "Internal Quote Calculation Summary",
    `Client: ${clientName}`,
    `Package: ${canSize}`,
    `Case Pack: ${result.casePack} pack`,
    `Annual Cases: ${whole(result.annualCases)}`,
    `Runs Per Year: ${result.runsPerYear}`,
    `SKU Count: ${result.skuCount}`,
    `Cases Per Run: ${whole(result.casesPerRun)}`,
    `Cases Per SKU Per Run: ${whole(result.casesPerSkuPerRun)}`,
    `Max Weekly Capacity: ${whole(result.maxWeeklyCases)} cases`,
    `Weeks Per Run: ${result.weeksPerRun.toFixed(2)}`,
    `Annual Capacity Utilization: ${pct(result.utilization)}`,
    `Tolling: ${money(result.tolling, 4)} / can`,
    `Recommended Tolling: ${money(result.recommendedTolling, 4)} / can`,
    `Materials Total: ${money(result.materialsPerCan, 4)} / can`,
    `Services Total: ${money(result.servicesPerCan, 4)} / can`,
    `Included in Tolling Value: ${money(result.includedInToll, 4)} / can`,
    `Estimated Total: ${money(result.pricePerCan, 4)} / can`,
    `Estimated Total: ${money(result.pricePerCase, 2)} / case`,
    `Annual Revenue: ${money(result.annualRevenue, 2)}`,
    `Review Status: ${result.status}`,
    `Review Note: ${result.statusNote}`,
    `Operational Grade: ${result.operationalGrade}`,
    `Recommended Increase: ${(result.recommendedIncreasePct * 100).toFixed(1)}%`,
    customTermLines.length ? `Custom Terms:\n${customTermLines.map((line) => `*${line}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");

  const csvText = csvRowsToText([
    ["Field", "Value"],
    ["Client", clientName],
    ["Package", canSize],
    ["Case Pack", `${result.casePack} pack`],
    ["Annual Cases", result.annualCases],
    ["Runs Per Year", result.runsPerYear],
    ["SKU Count", result.skuCount],
    ["Cases Per Run", result.casesPerRun],
    ["Cases Per SKU Per Run", result.casesPerSkuPerRun],
    ["Max Weekly Capacity", result.maxWeeklyCases],
    ["Weeks Per Run", result.weeksPerRun],
    ["Utilization", pct(result.utilization)],
    ["Tolling Per Can", result.tolling],
    ["Recommended Tolling Per Can", result.recommendedTolling],
    ["Materials Per Can", result.materialsPerCan],
    ["Services Per Can", result.servicesPerCan],
    ["Included In Tolling Per Can", result.includedInToll],
    ["Estimated Price Per Can", result.pricePerCan],
    ["Estimated Price Per Case", result.pricePerCase],
    ["Annual Revenue", result.annualRevenue],
    ["Cans + Ends", modeLabel(canEndMode)],
    ["Trays", modeLabel(trayMode)],
    ["Case Labels", modeLabel(caseLabelMode)],
    ["Pallet Materials", modeLabel(palletMode)],
    ["Sleeve Application", modeLabel(sleeveMode)],
    ["Carton Application", modeLabel(cartonMode)],
    ["Operational Grade", result.operationalGrade],
    ["Recommended Increase", `${(result.recommendedIncreasePct * 100).toFixed(1)}%`],
    ["Custom Terms", customTermLines.map((line) => `*${line}`).join("\n")],
  ]);

  function safeFileName(value) {
    return String(value || "Quote").replace(/[^a-z0-9-_ ]/gi, "_").trim() || "Quote";
  }

  function dataHref(content, type) {
    return `data:${type};charset=utf-8,${encodeURIComponent(content)}`;
  }

  function printClientQuote() {
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(clientQuoteHtml);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    }
  }

  function copyQuote() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(quoteText);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <h1 className="text-3xl font-semibold">Bev-Hub Quote Calculator</h1>

  <p className="text-xs font-semibold text-green-700">
    Version: Custom Terms Live 2
  </p>

  <p className="mt-2 text-sm text-slate-600">
    Manhattan standard weekly output: 75,000 12-pack cases or 37,500 24-pack cases. Weekly output can be adjusted by quote if operations confirms a different run rate.
  </p>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold">Quote Inputs</h2>
            <div className="space-y-5">
              <TextInput label="Client / Brand" value={clientName} onChange={setClientName} />
              <div className="grid grid-cols-2 gap-3">
                <TextInput label="Annual Cases" value={annualCases} onChange={setAnnualCases} type="number" />
                <TextInput label="Production Weeks / Year" value={runsPerYear} onChange={setRunsPerYear} type="number" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TextInput label="SKU Count" value={skuCount} onChange={setSkuCount} type="number" />
                <SelectInput label="Case Pack" value={casePack} onChange={setCasePack} options={["12", "24"]} labels={{ "12": "12 pack", "24": "24 pack" }} />
              </div>
              <SelectInput label="Can Size" value={canSize} onChange={setCanSize} options={["12 oz Sleek", "250 ml Slim", "7.5 oz", "16 oz"]} />
              <TextInput label="Tolling $ / Can" value={tolling} onChange={setTolling} type="number" step="0.0001" />
              <TextInput label="Cases / Pallet" value={casesPerPallet} onChange={setCasesPerPallet} type="number" />

              <div className="rounded-xl border p-4">
                <h3 className="mb-3 text-sm font-semibold">Weekly Output Assumptions</h3>
                <p className="mb-3 text-xs text-slate-500">Manhattan standard is 75,000 12-pack cases/week for 12 oz sleek. Adjust only if operations confirms a different weekly run rate.</p>
                <div className="grid grid-cols-2 gap-3">
                  <TextInput label="12-Pack Cases / Week" value={weeklyOutput12Pack} onChange={setWeeklyOutput12Pack} type="number" />
                  <TextInput label="24-Pack Cases / Week" value={weeklyOutput24Pack} onChange={setWeeklyOutput24Pack} type="number" />
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <h3 className="mb-3 text-sm font-semibold">Manhattan OH Coverage Assumptions</h3>
                <p className="mb-3 text-xs text-slate-500">Used to grade operational profitability like the Manhattan pricing guide.</p>
                <div className="grid grid-cols-2 gap-3">
                  <TextInput label="Low Weekly OH" value={lowWeeklyOH} onChange={setLowWeeklyOH} type="number" />
                  <TextInput label="High Weekly OH" value={highWeeklyOH} onChange={setHighWeeklyOH} type="number" />
                  <TextInput label="COGS Buffer" value={cogsBuffer} onChange={setCogsBuffer} type="number" step="0.01" />
                </div>
              </div>

              <div className="rounded-xl bg-slate-100 p-4">
                <h3 className="mb-3 text-sm font-semibold">Material and Service Treatment</h3>
                <div className="space-y-3">
                  <ModeSelect label="Cans + Ends" value={canEndMode} onChange={setCanEndMode} />
                  <ModeSelect label="Trays" value={trayMode} onChange={setTrayMode} />
                  <ModeSelect label="Case Labels" value={caseLabelMode} onChange={setCaseLabelMode} />
                  <ModeSelect label="Pallet Materials" value={palletMode} onChange={setPalletMode} />
                  <ModeSelect label="Sleeve Application" value={sleeveMode} onChange={setSleeveMode} />
                  <ModeSelect label="Carton Application" value={cartonMode} onChange={setCartonMode} />
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <h3 className="mb-3 text-sm font-semibold">Adjustable Cost Overrides</h3>
                <div className="grid grid-cols-2 gap-3">
                  <TextInput label="Cans + Ends $ / Can" value={canEndCostPerCan} onChange={setCanEndCostPerCan} type="number" step="0.0001" />
                  <TextInput label="Tray $ / Case" value={trayCostPerCase} onChange={setTrayCostPerCase} type="number" step="0.0001" />
                  <TextInput label="Case Label $ / Case" value={caseLabelCostPerCase} onChange={setCaseLabelCostPerCase} type="number" step="0.0001" />
                  <TextInput label="Pallet $ / Pallet" value={palletMaterialCostPerPallet} onChange={setPalletMaterialCostPerPallet} type="number" step="0.0001" />
                  <TextInput label="Sleeve $ / Can" value={sleeveCostPerCan} onChange={setSleeveCostPerCan} type="number" step="0.0001" />
                  <TextInput label="Carton $ / Can" value={cartonCostPerCan} onChange={setCartonCostPerCan} type="number" step="0.0001" />
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <h3 className="mb-3 text-sm font-semibold">Custom Quote Terms</h3>
                <p className="mb-3 text-xs text-slate-500">Each line entered below will automatically format as a starred term at the bottom of the quote.</p>
                <textarea
                  value={customTerms}
                  onChange={(event) => setCustomTerms(event.target.value)}
                  placeholder="Enter customer-specific terms, assumptions, commercialization notes, freight terms, MOQ language, promotional pricing notes, or other quote-specific details."
                  className="min-h-[140px] w-full rounded-xl border px-3 py-2 text-sm"
                />
                <p className="mt-2 text-xs text-slate-500">These terms will appear on the client quote, internal summary, and CSV export.</p>
              </div>
            </div>
          </section>

          <main className="space-y-6 lg:col-span-2">
            <section className="grid grid-cols-1 gap-4 md:grid-cols-5">
              <Kpi title="Cases / Production Week" value={whole(result.weeklyCasesForProfit)} />
              <Kpi title="Line Weeks Needed" value={result.weeksPerRun.toFixed(2)} />
              <Kpi title="Max Weekly" value={`${whole(result.maxWeeklyCases)} cases`} />
              <Kpi title="Utilization" value={pct(result.utilization)} />
              <Kpi title="Annual Revenue" value={money(result.annualRevenue, 2)} />
            </section>

            <Panel title="Pricing Output" action={<button onClick={copyQuote} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Copy Quote Summary</button>}>
              <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-4">
                <a href={dataHref(clientQuoteHtml, "text/html")} download={`Client Quote - ${safeFileName(clientName)}.html`} className="rounded-xl border bg-white px-3 py-2 text-center text-sm font-semibold hover:bg-slate-50">Download Client Quote</a>
                <button type="button" onClick={printClientQuote} className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50">Print / Save PDF</button>
                <a href={dataHref(internalSummaryText, "text/plain")} download={`Internal Quote Calculation - ${safeFileName(clientName)}.txt`} className="rounded-xl border bg-white px-3 py-2 text-center text-sm font-semibold hover:bg-slate-50">Download Internal Summary</a>
                <a href={dataHref(csvText, "text/csv")} download={`Quote Calculation - ${safeFileName(clientName)}.csv`} className="rounded-xl border bg-white px-3 py-2 text-center text-sm font-semibold hover:bg-slate-50">Export CSV</a>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Output label="Tolling" value={`${money(result.tolling, 4)} / can`} />
                <Output label="Recommended Tolling" value={`${money(result.recommendedTolling, 4)} / can`} />
                <Output label="Operational Grade" value={result.operationalGrade} />
                <Output label="OH Result" value={`${(result.ohResultPct * 100).toFixed(2)}%`} />
                <Output label="Recommended Increase" value={`${(result.recommendedIncreasePct * 100).toFixed(1)}%`} />
                <Output label="Materials" value={`${money(result.materialsPerCan, 4)} / can`} />
                <Output label="Additional Services" value={`${money(result.servicesPerCan, 4)} / can`} />
                <Output label="Estimated Total" value={`${money(result.pricePerCan, 4)} / can`} />
                <Output label="Estimated Total" value={`${money(result.pricePerCase, 2)} / case`} />
                <Output label="Weekly Output Assumption" value={`${whole(result.maxWeeklyCases)} cases`} />
                <Output label="Weekly Revenue" value={money(result.weeklyRevenue, 2)} />
                <Output label="Est. Week Net Inc." value={money(result.estimatedWeeklyNet, 2)} />
                <Output label="Estimated Whole Run Net" value={money(result.estimatedWholeRunNet, 2)} />
              </div>
            </Panel>

            <Panel title="Operational Review">
              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="font-semibold">{result.status}</div>
                <p className="mt-1 text-sm text-slate-600">{result.statusNote}</p>
              </div>
            </Panel>

            <Panel title="Cost Breakdown">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Output label="Cans + Ends" value={`${money(result.canEndCost, 4)} / can`} />
                <Output label="Trays" value={`${money(result.trayCost, 4)} / can`} />
                <Output label="Case Labels" value={`${money(result.caseLabelCost, 4)} / can`} />
                <Output label="Pallet Materials" value={`${money(result.palletCost, 4)} / can`} />
                <Output label="Sleeve Application" value={`${money(result.sleeveCost, 4)} / can`} />
                <Output label="Carton Application" value={`${money(result.cartonCost, 4)} / can`} />
              </div>
            </Panel>

            <Panel title="Calculation Checks">
              <div className="space-y-2">
                {tests.map((test) => (
                  <div key={test.name} className="flex justify-between rounded-xl border bg-slate-50 p-3 text-sm">
                    <span>{test.name}</span>
                    <span className={test.pass ? "font-semibold text-green-700" : "font-semibold text-red-700"}>{test.pass ? "Pass" : "Review"}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </main>
        </div>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-2xl font-semibold">Client Quote Sheet</h2>
          <div className="mx-auto max-w-4xl border bg-white p-10 text-slate-900" style={{ fontFamily: "Calibri, Arial, sans-serif" }}>
            <div className="border-b pb-5">
              <h3 className="text-3xl font-semibold">Manufacturing Quote</h3>
              <p className="mt-1 text-sm text-slate-600">Shelf-stable beverage production estimate</p>
              <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                <QuoteLine label="Client" value={clientName} />
                <QuoteLine label="Package" value={canSize} />
                <QuoteLine label="Case Pack" value={`${result.casePack} pack`} />
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-8">
              <div>
                <h4 className="mb-3 border-b pb-2 text-lg font-semibold">Volume Assumptions</h4>
                <QuoteLine label="Annual Volume" value={`${whole(result.annualCases)} cases`} />
                <QuoteLine label="Runs Per Year" value={String(result.runsPerYear)} />
                <QuoteLine label="Cases Per Run" value={whole(result.casesPerRun)} />
                <QuoteLine label="Production Time Per Run" value={`${result.weeksPerRun.toFixed(2)} weeks`} />
              </div>
              <div>
                <h4 className="mb-3 border-b pb-2 text-lg font-semibold">Pricing Estimate</h4>
                <QuoteLine label="Tolling" value={`${money(result.tolling, 4)} / can`} />
                <QuoteLine label="Materials and Packaging" value={`${money(result.materialsPerCan, 4)} / can`} />
                <QuoteLine label="Additional Services" value={`${money(result.servicesPerCan, 4)} / can`} />
                <div className="mt-3 border-t pt-3">
                  <QuoteLine label="Estimated Total" value={`${money(result.pricePerCan, 4)} / can`} strong />
                  <QuoteLine label="Estimated Total" value={`${money(result.pricePerCase, 2)} / case`} strong />
                </div>
              </div>
            </div>

            <div className="mt-8">
              <h4 className="mb-3 border-b pb-2 text-lg font-semibold">Materials and Services</h4>
              <div className="grid grid-cols-2 gap-x-10 text-sm">
                <QuoteLine label="Cans and Ends" value={modeLabel(canEndMode)} />
                <QuoteLine label="Trays" value={modeLabel(trayMode)} />
                <QuoteLine label="Case Labels" value={modeLabel(caseLabelMode)} />
                <QuoteLine label="Pallet Materials" value={modeLabel(palletMode)} />
                <QuoteLine label="Sleeve Application" value={modeLabel(sleeveMode)} />
                <QuoteLine label="Carton Application" value={modeLabel(cartonMode)} />
              </div>
            </div>

            <div className="mt-8 border-t pt-5 text-xs leading-6 text-slate-600">
              <p>*This quote is based on the production scope, packaging configuration, and assumptions outlined above. Final pricing is subject to confirmation of product specifications, packaging requirements, production schedule, and executed commercial agreement.</p>
              <p>*Acceptance of this quotation constitutes the client’s obligation to issue a production purchase order (PO) for each authorized production run.</p>
              <p>*Bev-Hub has not produced this product previously and pricing is based on the information provided during the quoting process.</p>
              <p>*Bev-Hub will manufacture strictly to the client-approved formulation and specifications. Bev-Hub assumes no responsibility for formulation performance, stability, or market outcomes, provided production is completed without human error or equipment malfunction.</p>
              <p>*Standard commercialization through Process Authority is estimated at $3,000 per SKU.</p>

              {customTermLines.length > 0 && (
                <div className="mt-5 border-t pt-4">
                  <div className="space-y-2 text-sm text-slate-700">
                    {customTermLines.map((line, index) => (
                      <div key={index}>*{line}</div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-5 border-t pt-4">
                <div className="font-semibold">Warehousing</div>
                <div>Pallets In: $15 / pallet raw goods</div>
                <div>Cold Storage: $20 / pallet</div>
                <div>Pallets Out: $8 / pallet finished goods</div>
                <div>Pallet Storage: $15 / pallet per month</div>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-12 text-sm text-slate-800">
                <Signature title="Client" showPo />
                <Signature title="Bev-Hub" />
              </div>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <h2 className="mb-3 text-xl font-semibold">Internal Calculation Export</h2>
              <textarea readOnly value={internalSummaryText} className="h-96 w-full rounded-xl border bg-slate-900 p-4 font-mono text-xs text-white" />
            </div>

            <div>
              <h2 className="mb-3 text-xl font-semibold">CSV Export Data</h2>
              <textarea readOnly value={csvText} className="h-96 w-full rounded-xl border bg-slate-900 p-4 font-mono text-xs text-white" />
            </div>
          </div>

          <h2 className="mb-3 mt-8 text-xl font-semibold">Copy-Ready Quote Summary</h2>
          <pre className="whitespace-pre-wrap rounded-xl bg-slate-900 p-4 text-sm text-white">{quoteText}</pre>
        </section>
      </div>
    </div>
  );
}

function TextInput({ label, value, onChange, type = "text", step }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input className="w-full rounded-xl border px-3 py-2 text-sm" type={type} step={step} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectInput({ label, value, onChange, options, labels = {} }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select className="w-full rounded-xl border px-3 py-2 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>{labels[option] || option}</option>
        ))}
      </select>
    </label>
  );
}

function ModeSelect({ label, value, onChange }) {
  return (
    <SelectInput
      label={label}
      value={value}
      onChange={onChange}
      options={["additional", "included", "clientSupplied", "notNeeded"]}
      labels={{ additional: "Additional cost", included: "Included in tolling", clientSupplied: "Client supplied", notNeeded: "Not needed" }}
    />
  );
}

function Kpi({ title, value }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs uppercase text-slate-500">{title}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Panel({ title, action, children }) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Output({ label, value }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-3">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function QuoteLine({ label, value, strong = false }) {
  return (
    <div className="flex justify-between gap-6 py-1">
      <span className="text-slate-600">{label}</span>
      <span className={strong ? "font-bold" : "font-semibold"}>{value}</span>
    </div>
  );
}

function Signature({ title, showPo = false }) {
  return (
    <div>
      <div className="mb-6">
        <div className="mb-1 font-semibold">{title}</div>
        <div className="border-b border-slate-500 pb-1"></div>
      </div>
      <div className="mb-6">
        <div className="mb-1 font-semibold">Name</div>
        <div className="border-b border-slate-500 pb-1"></div>
      </div>
      {showPo && (
        <div>
          <div className="mb-1 inline-block bg-yellow-200 px-1 font-semibold">PO Number</div>
          <div className="border-b border-slate-500 pb-1"></div>
        </div>
      )}
    </div>
  );
}
