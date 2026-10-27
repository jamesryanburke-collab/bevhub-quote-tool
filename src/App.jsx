"use client";

import React, { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const DEFAULT_WEEKLY_12_PACK = 75000;
const DEFAULT_WEEKLY_24_PACK = 37500;
const DEFAULT_LOW_WEEKLY_OH = 250000;
const DEFAULT_HIGH_WEEKLY_OH = 350000;
const DEFAULT_COGS_BUFFER = 0;
const DEFAULT_TARGET_GRADE = 0.1;
const RUN_WEEKS_PER_YEAR = 48;

const RECOMMENDED_QUOTE_DISPLAY = {
  client: true, package: true, casePack: true, pricingProgram: true,
  volume: true, productionPeriod: true, casesPerWeek: false, lineWeeksNeeded: false, equivalentCases: false,
  facilityFee: true, tolling: true, materials: true, services: true, pricePerCan: true, pricePerCase: true,
  productTotal: true, quoteTotal: true,
  materialsSection: true, cansEnds: true, trays: true, caseLabels: true, palletMaterials: true, sleeveApplication: true, cartonApplication: true,
  standardTerms: true, commercializationTerm: true, warehousing: true, customTerms: true, signatures: true,
};


const MATERIAL_DEFAULTS = {
  "12 oz Sleek": { canEnd: 0.15524, tray12: 0.139, tray24: 0.285 },
  "250 ml Slim": { canEnd: 0.1681, tray12: 0.142, tray24: 0.2544 },
  "7.5 oz": { canEnd: 0.1545, tray12: 0.139, tray24: 0.285 },
  "16 oz": { canEnd: 0.2076, tray12: 0.139, tray24: 0.285 },
};

function toNumber(value, fallback = 0) {
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

function percent(value, decimals = 1) {
  return `${((value || 0) * 100).toFixed(decimals)}%`;
}

function modeLabel(mode) {
  if (mode === "additional") return "Additional cost";
  if (mode === "included") return "Included";
  if (mode === "clientSupplied") return "Client supplied";
  return "Not needed";
}

function isBevHubSupplied(mode) {
  return mode === "additional" || mode === "included";
}

function additionalCost(mode, cost) {
  return mode === "additional" ? cost : 0;
}

function includedCost(mode, cost) {
  return mode === "included" ? cost : 0;
}

function getWeeklyCapacity(casePack, weeklyOutput12Pack, weeklyOutput24Pack) {
  return Number(casePack) === 24
    ? Math.max(toNumber(weeklyOutput24Pack, DEFAULT_WEEKLY_24_PACK), 1)
    : Math.max(toNumber(weeklyOutput12Pack, DEFAULT_WEEKLY_12_PACK), 1);
}

function gradeFromPct(value) {
  if (value >= 0.3) return "Amazing";
  if (value >= 0.2) return "Great";
  if (value >= 0.1) return "Good";
  if (value >= 0.05) return "Better";
  if (value >= 0) return "Covering";
  return "Losing Money";
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

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function csvRowsToText(rows) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function calculateQuote(input) {
  const annualCases = Math.max(toNumber(input.annualCases, 0), 0);
  const productionWeeksPerYear = Math.max(toNumber(input.productionWeeksPerYear, 1), 1);
  const skuCount = Math.max(toNumber(input.skuCount, 1), 1);
  const casePack = Math.max(toNumber(input.casePack, 12), 1);
  const tolling = Math.max(toNumber(input.tolling, 0), 0);
  const casesPerPallet = Math.max(toNumber(input.casesPerPallet, 1), 1);
  const lowWeeklyOH = Math.max(toNumber(input.lowWeeklyOH, DEFAULT_LOW_WEEKLY_OH), 1);
  const highWeeklyOH = Math.max(toNumber(input.highWeeklyOH, DEFAULT_HIGH_WEEKLY_OH), 1);
  const cogsBuffer = Math.max(toNumber(input.cogsBuffer, DEFAULT_COGS_BUFFER), 0);
  const weeklyOutput12Pack = Math.max(toNumber(input.weeklyOutput12Pack, DEFAULT_WEEKLY_12_PACK), 1);
  const weeklyOutput24Pack = Math.max(toNumber(input.weeklyOutput24Pack, DEFAULT_WEEKLY_24_PACK), 1);
  const selected = MATERIAL_DEFAULTS[input.canSize] || MATERIAL_DEFAULTS["12 oz Sleek"];

  const maxWeeklyCases = getWeeklyCapacity(casePack, weeklyOutput12Pack, weeklyOutput24Pack);
  const annualCapacity = maxWeeklyCases * RUN_WEEKS_PER_YEAR;
  const weeklyCases = annualCases / productionWeeksPerYear;
  const weeklyCans = weeklyCases * casePack;
  const cansPerYear = annualCases * casePack;
  const casesPerSkuPerWeek = weeklyCases / skuCount;
  const lineWeeksNeeded = weeklyCases / maxWeeklyCases; // line weeks per production run
  const totalAnnualLineWeeks = annualCases / maxWeeklyCases;
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

  const materialsPerCan = canEndCost + trayCost + caseLabelCost + palletCost;
  const servicesPerCan = sleeveCost + cartonCost;

  const includedInToll =
    includedCost(input.canEndMode, canEndUnit) +
    includedCost(input.trayMode, trayUnit) +
    includedCost(input.caseLabelMode, caseLabelUnit) +
    includedCost(input.palletMode, palletUnit) +
    includedCost(input.sleeveMode, sleeveUnit) +
    includedCost(input.cartonMode, cartonUnit);

  const tollingWithIncluded = tolling + includedInToll;
  const pricePerCan = tollingWithIncluded + materialsPerCan + servicesPerCan;
  const pricePerCase = pricePerCan * casePack;

  const suppliedCogsPerCan =
    (isBevHubSupplied(input.canEndMode) ? canEndUnit : 0) +
    (isBevHubSupplied(input.trayMode) ? trayUnit : 0) +
    (isBevHubSupplied(input.caseLabelMode) ? caseLabelUnit : 0) +
    (isBevHubSupplied(input.palletMode) ? palletUnit : 0) +
    (isBevHubSupplied(input.sleeveMode) ? sleeveUnit : 0) +
    (isBevHubSupplied(input.cartonMode) ? cartonUnit : 0);

  const weeklyRevenue = weeklyCans * pricePerCan;
  const weeklyCogsEstimate = weeklyCans * suppliedCogsPerCan * (1 + cogsBuffer);
  const estimatedWeeklyNet = weeklyRevenue - lowWeeklyOH - weeklyCogsEstimate;
  const estimatedWeeklyContributionHighOH = weeklyRevenue - highWeeklyOH - weeklyCogsEstimate;
  const estimatedWholeRunNet = estimatedWeeklyNet * productionWeeksPerYear;
  const estimatedAnnualContributionHighOH = estimatedWeeklyContributionHighOH * productionWeeksPerYear;
  const lowOhBreakEvenPricePerCan = weeklyCans > 0 ? (lowWeeklyOH + weeklyCogsEstimate) / weeklyCans : 0;
  const highOhBreakEvenPricePerCan = weeklyCans > 0 ? (highWeeklyOH + weeklyCogsEstimate) / weeklyCans : 0;
  const lowOhPricingCushionPerCan = pricePerCan - lowOhBreakEvenPricePerCan;
  const highOhPricingCushionPerCan = pricePerCan - highOhBreakEvenPricePerCan;

  const ohResultPct = weeklyRevenue / lowWeeklyOH - 1;
  const afterSuppliesPct = estimatedWeeklyNet / lowWeeklyOH;
  const ohGrade = gradeFromPct(ohResultPct);
  const afterSuppliesGrade = gradeFromPct(afterSuppliesPct);
  const operationalGrade = afterSuppliesGrade;

  const requiredWeeklyRevenueForGood = lowWeeklyOH * (1 + DEFAULT_TARGET_GRADE) + weeklyCogsEstimate;
  const requiredTotalPriceForGood = weeklyCans > 0 ? requiredWeeklyRevenueForGood / weeklyCans : 0;
  const recommendedTolling = Math.max(requiredTotalPriceForGood - materialsPerCan - servicesPerCan, 0);
  const recommendedIncreasePct = tollingWithIncluded > 0 ? Math.max((recommendedTolling - tollingWithIncluded) / tollingWithIncluded, 0) : 0;

  let status = "Healthy";
  let statusNote = "This quote meets the Manhattan operational profitability threshold based on weekly revenue, OH coverage, and supplied COGS.";

  if (afterSuppliesPct < 0) {
    status = "Losing Money";
    statusNote = "This quote does not cover Manhattan weekly OH and supplied COGS. Increase tolling, reduce supplied materials exposure, or consolidate production weeks.";
  } else if (afterSuppliesPct < DEFAULT_TARGET_GRADE) {
    status = "Pricing Review";
    statusNote = "This quote covers OH but does not reach the preferred Good threshold. Review tolling or campaign structure before sending externally.";
  } else if (lineWeeksNeeded < 1) {
    status = "Cadence Review";
    statusNote = "This production campaign is below one full standard week of output. Confirm operations is aligned on the partial-week economics.";
  }

  return {
    annualCases,
    productionWeeksPerYear,
    skuCount,
    casePack,
    weeklyCases,
    weeklyCans,
    casesPerSkuPerWeek,
    cansPerYear,
    maxWeeklyCases,
    annualCapacity,
    lineWeeksNeeded,
    totalAnnualLineWeeks,
    utilization,
    tolling,
    tollingWithIncluded,
    recommendedTolling,
    recommendedIncreasePct,
    operationalGrade,
    ohGrade,
    afterSuppliesGrade,
    lowWeeklyOH,
    highWeeklyOH,
    cogsBuffer,
    weeklyRevenue,
    suppliedCogsPerCan,
    weeklyCogsEstimate,
    estimatedWeeklyNet,
    estimatedWeeklyContributionHighOH,
    estimatedWholeRunNet,
    estimatedAnnualContributionHighOH,
    lowOhBreakEvenPricePerCan,
    highOhBreakEvenPricePerCan,
    lowOhPricingCushionPerCan,
    highOhPricingCushionPerCan,
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

function runTests() {
  const baseInput = {
    annualCases: "300000",
    productionWeeksPerYear: "2",
    skuCount: "2",
    casePack: "24",
    canSize: "250 ml Slim",
    tolling: "0.40045",
    casesPerPallet: "91",
    canEndMode: "clientSupplied",
    trayMode: "clientSupplied",
    caseLabelMode: "clientSupplied",
    palletMode: "clientSupplied",
    sleeveMode: "notNeeded",
    cartonMode: "notNeeded",
    sleeveCostPerCan: "0.10",
    cartonCostPerCan: "0.0225",
    canEndCostPerCan: "0.1681",
    trayCostPerCase: "0.2544",
    caseLabelCostPerCase: "0.011",
    palletMaterialCostPerPallet: "13.03",
    weeklyOutput12Pack: "75000",
    weeklyOutput24Pack: "37500",
    lowWeeklyOH: "250000",
    highWeeklyOH: "350000",
    cogsBuffer: "0",
  };

  const result = calculateQuote(baseInput);
  return [
    { name: "75,000 12-pack cases equals one standard weekly assumption", pass: getWeeklyCapacity(12, 75000, 37500) === 75000 },
    { name: "37,500 24-pack cases equals one standard weekly assumption", pass: getWeeklyCapacity(24, 75000, 37500) === 37500 },
    { name: "300,000 annual cases over two production weeks equals 150,000 cases/week", pass: Math.abs(result.weeklyCases - 150000) < 0.0001 },
    { name: "300,000 24-pack cases equals 7,200,000 cans/year", pass: result.cansPerYear === 7200000 },
    { name: "Spreadsheet-style example grades as Amazing when materials are client supplied", pass: result.operationalGrade === "Amazing" },
    { name: "Custom terms split into clean starred lines", pass: getCustomTermLines("One\nTwo\n").length === 2 },
  ];
}

function BevHubPricingApp() {
  const ACCESS_PASSWORD = "ChangeThisPassword123!";
  const ACCESS_MAX_AGE_MS = 8 * 60 * 60 * 1000;

  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(() => {
    if (typeof window === "undefined") return false;

    const savedAccess = window.localStorage.getItem("bevhubQuoteAccess") === "true";
    const savedAt = Number(window.localStorage.getItem("bevhubQuoteAccessAt") || 0);
    const isStillValid = savedAccess && Date.now() - savedAt < ACCESS_MAX_AGE_MS;

    if (!isStillValid) {
      window.localStorage.removeItem("bevhubQuoteAccess");
      window.localStorage.removeItem("bevhubQuoteAccessAt");
    }

    return isStillValid;
  });

  function handleLogin() {
    if (passwordInput === ACCESS_PASSWORD) {
      window.localStorage.setItem("bevhubQuoteAccess", "true");
      window.localStorage.setItem("bevhubQuoteAccessAt", String(Date.now()));
      setIsAuthorized(true);
      setPasswordInput("");
      setLoginError("");
      return;
    }

    setLoginError("Incorrect password. Please try again.");
  }

  function handleLogout() {
    window.localStorage.removeItem("bevhubQuoteAccess");
    window.localStorage.removeItem("bevhubQuoteAccessAt");
    setIsAuthorized(false);
    setPasswordInput("");
  }
  const [clientName, setClientName] = useState("Client Name");
  const [annualCases, setAnnualCases] = useState("300000");
  const [productionWeeksPerYear, setProductionWeeksPerYear] = useState("2");
  const [skuCount, setSkuCount] = useState("2");
  const [casePack, setCasePack] = useState("24");
  const [canSize, setCanSize] = useState("250 ml Slim");
  const [tolling, setTolling] = useState("0.40045");
  const [casesPerPallet, setCasesPerPallet] = useState("91");

  const [canEndMode, setCanEndMode] = useState("clientSupplied");
  const [trayMode, setTrayMode] = useState("clientSupplied");
  const [caseLabelMode, setCaseLabelMode] = useState("clientSupplied");
  const [palletMode, setPalletMode] = useState("clientSupplied");
  const [sleeveMode, setSleeveMode] = useState("notNeeded");
  const [cartonMode, setCartonMode] = useState("notNeeded");

  const [canEndCostPerCan, setCanEndCostPerCan] = useState("0.1681");
  const [trayCostPerCase, setTrayCostPerCase] = useState("0.2544");
  const [caseLabelCostPerCase, setCaseLabelCostPerCase] = useState("0.011");
  const [palletMaterialCostPerPallet, setPalletMaterialCostPerPallet] = useState("13.03");
  const [sleeveCostPerCan, setSleeveCostPerCan] = useState("0.10");
  const [cartonCostPerCan, setCartonCostPerCan] = useState("0.0225");

  const [weeklyOutput12Pack, setWeeklyOutput12Pack] = useState("75000");
  const [weeklyOutput24Pack, setWeeklyOutput24Pack] = useState("37500");
  const [lowWeeklyOH, setLowWeeklyOH] = useState("250000");
  const [highWeeklyOH, setHighWeeklyOH] = useState("350000");
  const [cogsBuffer, setCogsBuffer] = useState("0");
  const [customTerms, setCustomTerms] = useState("");

  const [pricingProgram, setPricingProgram] = useState("annual");
  const [campaignCans, setCampaignCans] = useState("125000");
  const [minDayRevenueTarget, setMinDayRevenueTarget] = useState("60000");
  const [flexPremiumPerCan, setFlexPremiumPerCan] = useState("0.02");
  const [trialFacilityRate, setTrialFacilityRate] = useState("25000");
  const [trialExpectedCans, setTrialExpectedCans] = useState("15000");
  const [trialDaysReserved, setTrialDaysReserved] = useState("1");

  const [quoteDisplay, setQuoteDisplay] = useState(() => {
    if (typeof window === "undefined") return RECOMMENDED_QUOTE_DISPLAY;
    try {
      const saved = JSON.parse(window.localStorage.getItem("bevhubQuoteDisplay") || "null");
      return saved ? { ...RECOMMENDED_QUOTE_DISPLAY, ...saved } : RECOMMENDED_QUOTE_DISPLAY;
    } catch {
      return RECOMMENDED_QUOTE_DISPLAY;
    }
  });

  const [savedQuotes, setSavedQuotes] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = JSON.parse(window.localStorage.getItem("bevhubSavedQuotes") || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const [savedQuoteSearch, setSavedQuoteSearch] = useState("");
  const [savedQuoteStatusFilter, setSavedQuoteStatusFilter] = useState("All");
  const [activeSavedQuoteId, setActiveSavedQuoteId] = useState(null);
  const [saveNotice, setSaveNotice] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("bevhubQuoteDisplay", JSON.stringify(quoteDisplay));
    }
  }, [quoteDisplay]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("bevhubSavedQuotes", JSON.stringify(savedQuotes));
    }
  }, [savedQuotes]);

  function setQuoteOption(key, checked) {
    setQuoteDisplay((current) => ({ ...current, [key]: checked }));
  }

  function useRecommendedQuoteLayout() {
    setQuoteDisplay({ ...RECOMMENDED_QUOTE_DISPLAY });
  }

  function showAllQuoteFields() {
    setQuoteDisplay(Object.fromEntries(Object.keys(RECOMMENDED_QUOTE_DISPLAY).map((key) => [key, true])));
  }


  const equivalentCaseSourceCans = pricingProgram === "trial"
    ? Math.max(toNumber(trialExpectedCans, 0), 0)
    : Math.max(toNumber(campaignCans, 0), 0);

  const calculatedEquivalentCases = (
    equivalentCaseSourceCans / Math.max(toNumber(casePack, 12), 1)
  ).toFixed(2);

  const effectiveAnnualCases = pricingProgram === "annual" ? annualCases : calculatedEquivalentCases;
  const effectiveProductionWeeks = pricingProgram === "annual" ? productionWeeksPerYear : "1";

  const input = {
    annualCases: effectiveAnnualCases,
    productionWeeksPerYear: effectiveProductionWeeks,
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
    canEndCostPerCan,
    trayCostPerCase,
    caseLabelCostPerCase,
    palletMaterialCostPerPallet,
    sleeveCostPerCan,
    cartonCostPerCan,
    weeklyOutput12Pack,
    weeklyOutput24Pack,
    lowWeeklyOH,
    highWeeklyOH,
    cogsBuffer,
  };

  const result = useMemo(() => calculateQuote(input), [
    annualCases,
    productionWeeksPerYear,
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
    canEndCostPerCan,
    trayCostPerCase,
    caseLabelCostPerCase,
    palletMaterialCostPerPallet,
    sleeveCostPerCan,
    cartonCostPerCan,
    weeklyOutput12Pack,
    weeklyOutput24Pack,
    lowWeeklyOH,
    highWeeklyOH,
    cogsBuffer,
    pricingProgram,
    campaignCans,
    trialExpectedCans,
    trialDaysReserved,
  ]);

  const tests = useMemo(() => runTests(), []);
  const customTermLines = getCustomTermLines(customTerms);
  const customTermsHtml = customTermLines.map((line) => `<p>*${escapeHtml(line)}</p>`).join("");

  const programPricing = useMemo(() => {
    const cans = pricingProgram === "annual" ? result.cansPerYear : Math.max(toNumber(campaignCans, 0), 0);
    const baseTolling = result.tollingWithIncluded;

    if (pricingProgram === "flex") {
      const minimumRevenue = Math.max(toNumber(minDayRevenueTarget, 0), 0);
      const flexPremium = Math.max(toNumber(flexPremiumPerCan, 0), 0);

      // Advisory model: the entered tolling rate remains the quoted commercial tolling.
      // The minimum day revenue target is used only to show the shortfall and recommended rate.
      const enteredTollingRevenue = cans * baseTolling;
      const customerTolling = baseTolling + flexPremium;
      const flexRevenue = customerTolling * cans;
      const capacityRecoveryShortfall = Math.max(minimumRevenue - flexRevenue, 0);
      const recommendedRecoveryPerCan = cans > 0 ? capacityRecoveryShortfall / cans : 0;
      const recommendedFlexTolling = customerTolling + recommendedRecoveryPerCan;
      const flexRecommendedIncreasePct = customerTolling > 0
        ? recommendedRecoveryPerCan / customerTolling
        : recommendedRecoveryPerCan > 0 ? 1 : 0;
      const flexRecoveryPct = minimumRevenue > 0 ? flexRevenue / minimumRevenue - 1 : 0;
      const flexOperationalGrade = gradeFromPct(flexRecoveryPct);
      const pricePerCan = customerTolling + result.materialsPerCan + result.servicesPerCan;
      const productionTotal = pricePerCan * cans;

      return {
        programName: "Flex Commercial Production",
        volumeLabel: "Campaign Volume",
        volumeValue: `${whole(cans)} cans`,
        periodLabel: "Production Days Reserved",
        periodValue: "1",
        customerTolling,
        pricePerCan,
        pricePerCase: pricePerCan * result.casePack,
        baseTolling,
        baseRevenue: enteredTollingRevenue,
        enteredTollingRevenue,
        dayRecoveryFee: capacityRecoveryShortfall,
        dayRecoveryPerCan: recommendedRecoveryPerCan,
        capacityRecoveryShortfall,
        recommendedRecoveryPerCan,
        flexPremium,
        campaignCans: cans,
        minimumRevenue,
        facilityRate: 0,
        productionTotal,
        totalQuote: productionTotal,
        flexRevenue,
        flexRecoveryPct,
        flexOperationalGrade,
        recommendedFlexTolling,
        flexRecommendedIncreasePct,
        note: "Quoted under Flex Commercial Production. The entered tolling rate plus the Flex Premium drives the customer quote and campaign revenue. The minimum day revenue target is advisory and is used to calculate any revenue shortfall and recommended customer tolling.",
      };
    }

    if (pricingProgram === "trial") {
      const cansForTrial = Math.max(toNumber(trialExpectedCans, 0), 0);
      const facilityRate = Math.max(toNumber(trialFacilityRate, 0), 0);
      const trialDays = Math.max(toNumber(trialDaysReserved, 1), 1);
      const minimumDayRevenue = Math.max(toNumber(minDayRevenueTarget, 0), 0);
      const customerTolling = baseTolling;
      const pricePerCan = customerTolling + result.materialsPerCan + result.servicesPerCan;
      const productionTotal = pricePerCan * cansForTrial;
      const totalQuote = facilityRate + productionTotal;
      const trialRequiredRevenue = minimumDayRevenue * trialDays;
      const trialRecoveryPct = trialRequiredRevenue > 0 ? totalQuote / trialRequiredRevenue - 1 : 0;
      const trialOperationalGrade = gradeFromPct(trialRecoveryPct);

      return {
        programName: "Commercial Trial Program",
        volumeLabel: "Trial Volume",
        volumeValue: `${whole(cansForTrial)} cans`,
        periodLabel: "Trial Days Reserved",
        periodValue: String(trialDays),
        customerTolling,
        pricePerCan,
        pricePerCase: pricePerCan * result.casePack,
        baseTolling: customerTolling,
        baseRevenue: customerTolling * cansForTrial,
        dayRecoveryFee: 0,
        dayRecoveryPerCan: 0,
        flexPremium: 0,
        campaignCans: cansForTrial,
        minimumRevenue: minimumDayRevenue,
        facilityRate,
        productionTotal,
        totalQuote,
        trialDays,
        trialRequiredRevenue,
        trialRecoveryPct,
        trialOperationalGrade,
        note: "Quoted under the Commercial Trial Program with the daily facility fee shown as a separate line item. Tolling remains independent from the facility fee, and consumable materials are excluded unless otherwise stated.",
      };
    }

    return {
      programName: "Annual Contract",
      volumeLabel: "Annual Volume",
      volumeValue: `${whole(result.annualCases)} cases`,
      periodLabel: "Production Weeks / Year",
      periodValue: String(result.productionWeeksPerYear),
      customerTolling: result.tollingWithIncluded,
      pricePerCan: result.pricePerCan,
      pricePerCase: result.pricePerCase,
      baseTolling: result.tollingWithIncluded,
      baseRevenue: result.weeklyRevenue,
      dayRecoveryFee: 0,
      dayRecoveryPerCan: 0,
      flexPremium: 0,
      campaignCans: result.cansPerYear,
      minimumRevenue: 0,
      facilityRate: 0,
      note: "Quoted under standard annual contract assumptions.",
    };
  }, [
    pricingProgram,
    result,
    campaignCans,
    minDayRevenueTarget,
    flexPremiumPerCan,
    trialFacilityRate,
    trialExpectedCans,
    trialDaysReserved,
  ]);

  const htmlLine = (enabled, label, value, strong = false) => enabled
    ? `<div class="line"><span>${escapeHtml(label)}</span><span class="${strong ? "strong" : ""}">${value}</span></div>`
    : "";

  const quoteHeaderHtml = [
    htmlLine(quoteDisplay.client, "Client", escapeHtml(clientName), true),
    htmlLine(quoteDisplay.package, "Package", escapeHtml(canSize), true),
    htmlLine(quoteDisplay.casePack, "Case Pack", `${result.casePack} pack`, true),
    htmlLine(quoteDisplay.pricingProgram, "Pricing Program", escapeHtml(programPricing.programName), true),
  ].join("");

  const quoteVolumeHtml = [
    htmlLine(quoteDisplay.volume, programPricing.volumeLabel, programPricing.volumeValue, true),
    htmlLine(quoteDisplay.productionPeriod, programPricing.periodLabel, programPricing.periodValue, true),
    htmlLine(quoteDisplay.equivalentCases && pricingProgram !== "annual", "Equivalent Cases", `${calculatedEquivalentCases} cases`, true),
    htmlLine(quoteDisplay.casesPerWeek, "Cases / Production Week", whole(result.weeklyCases), true),
    htmlLine(quoteDisplay.lineWeeksNeeded, "Line Weeks / Run", result.lineWeeksNeeded.toFixed(2), true),
  ].join("");

  // Additional-cost materials only; included items are already inside tolling.
  // No changes are made to calculateQuote or to price-per-can mathematics.
  const materialQuoteLines = [
    [canEndMode, "Cans and Ends", result.canEndCost],
    [trayMode, "Trays", result.trayCost],
    [caseLabelMode, "Case Labels", result.caseLabelCost],
    [palletMode, "Pallet Materials", result.palletCost],
  ].filter(([mode, , cost]) => mode === "additional" && cost > 0);

  const quotePricingHtml = [
    htmlLine(quoteDisplay.facilityFee && pricingProgram === "trial", "Daily Facility Fee", money(programPricing.facilityRate, 2), true),
    htmlLine(quoteDisplay.tolling, pricingProgram === "flex" ? "Customer Tolling" : "Tolling", `${money(programPricing.customerTolling, 4)} / can`, true),
    ...(quoteDisplay.materials ? [
      ...materialQuoteLines.map(([, label, cost]) => htmlLine(true, label, `${money(cost, 4)} / can`, true)),
      htmlLine(true, "Materials Subtotal", `${money(result.materialsPerCan, 4)} / can`, true),
    ] : []),
    htmlLine(quoteDisplay.services, "Additional Services", `${money(result.servicesPerCan, 4)} / can`, true),
    htmlLine(quoteDisplay.pricePerCan, "Estimated Total", `${money(programPricing.pricePerCan, 4)} / can`, true),
    htmlLine(quoteDisplay.pricePerCase, "Estimated Total", `${money(programPricing.pricePerCase, 2)} / case`, true),
    htmlLine(quoteDisplay.productTotal && pricingProgram === "flex", "Estimated Campaign Total", money(programPricing.productionTotal, 2), true),
    htmlLine(quoteDisplay.productTotal && pricingProgram === "trial", "Estimated Product Total", money(programPricing.productionTotal, 2), true),
    htmlLine(quoteDisplay.quoteTotal && pricingProgram === "trial", "Estimated Quote Total", money(programPricing.totalQuote, 2), true),
  ].join("");

  const materialsRowsHtml = [
    htmlLine(quoteDisplay.cansEnds, "Cans and Ends", modeLabel(canEndMode), true),
    htmlLine(quoteDisplay.trays, "Trays", modeLabel(trayMode), true),
    htmlLine(quoteDisplay.caseLabels, "Case Labels", modeLabel(caseLabelMode), true),
    htmlLine(quoteDisplay.palletMaterials, "Pallet Materials", modeLabel(palletMode), true),
    htmlLine(quoteDisplay.sleeveApplication, "Sleeve Application", modeLabel(sleeveMode), true),
    htmlLine(quoteDisplay.cartonApplication, "Carton Application", modeLabel(cartonMode), true),
  ].join("");

  const standardTermsHtml = quoteDisplay.standardTerms ? `<p>*This quote is based on the production scope, packaging configuration, and assumptions outlined above. Final pricing is subject to confirmation of product specifications, packaging requirements, production schedule, and executed commercial agreement.</p><p>*Acceptance of this quotation constitutes the client's obligation to issue a production purchase order (PO) for each authorized production run.</p><p>*Bev-Hub has not produced this product previously and pricing is based on the information provided during the quoting process.</p><p>*Bev-Hub will manufacture strictly to the client-approved formulation and specifications. Bev-Hub assumes no responsibility for formulation performance, stability, or market outcomes, provided production is completed without human error or equipment malfunction.</p>` : "";
  const commercializationHtml = quoteDisplay.commercializationTerm ? `<p>*Standard commercialization through Process Authority is estimated at $3,000 per SKU.</p>` : "";
  const visibleCustomTermsHtml = quoteDisplay.customTerms ? customTermsHtml : "";
  const warehousingHtml = quoteDisplay.warehousing ? `<h2>Warehousing</h2><p>Pallets In: $15 / pallet raw goods<br/>Cold Storage: $20 / pallet<br/>Pallets Out: $8 / pallet finished goods<br/>Pallet Storage: $15 / pallet per month</p>` : "";
  const signaturesHtml = quoteDisplay.signatures ? `<div class="signature"><div><div>Client</div><div class="sigline"></div><div>Name</div><div class="sigline"></div><div>PO Number</div><div class="sigline"></div></div><div><div>Bev-Hub</div><div class="sigline"></div><div>Name</div><div class="sigline"></div></div></div>` : "";

  const clientQuoteHtml = `<!doctype html><html><head><title>Manufacturing Quote - ${escapeHtml(clientName)}</title><style>body{font-family:Calibri,Arial,sans-serif;color:#0f172a;padding:32px}.page{max-width:850px;margin:0 auto;border:1px solid #cbd5e1;padding:36px}h1{font-size:30px;margin:0}h2{font-size:18px;border-bottom:1px solid #cbd5e1;padding-bottom:6px;margin-top:28px}.muted{color:#64748b;font-size:13px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:28px}.line{display:flex;justify-content:space-between;gap:24px;padding:3px 0;font-size:14px}.strong{font-weight:700}.notes{border-top:1px solid #cbd5e1;margin-top:28px;padding-top:18px;font-size:12px;line-height:1.55;color:#475569}.signature{display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-top:32px;font-size:14px}.sigline{border-bottom:1px solid #475569;height:24px;margin-bottom:18px}@media print{body{padding:0}.page{border:none}}</style></head><body><div class="page"><h1>Manufacturing Quote</h1><div class="muted">Manhattan, KS production estimate</div>${quoteHeaderHtml ? `<div class="grid" style="margin-top:20px;">${quoteHeaderHtml}</div>` : ""}<div class="grid">${quoteVolumeHtml ? `<div><h2>Volume Assumptions</h2>${quoteVolumeHtml}</div>` : ""}${quotePricingHtml ? `<div><h2>Pricing Estimate</h2>${quotePricingHtml}</div>` : ""}</div>${quoteDisplay.materialsSection && materialsRowsHtml ? `<h2>Materials and Services</h2><div class="grid">${materialsRowsHtml}</div>` : ""}${standardTermsHtml || commercializationHtml || visibleCustomTermsHtml || warehousingHtml ? `<div class="notes">${standardTermsHtml}${commercializationHtml}${visibleCustomTermsHtml}${warehousingHtml}</div>` : ""}${signaturesHtml}</div></body></html>`;

  const internalSummaryText = [
    "Internal Manhattan Quote Calculation Summary",
    quoteDisplay.client ? `Client: ${clientName}` : "",
    quoteDisplay.package ? `Package: ${canSize}` : "",
    quoteDisplay.casePack ? `Case Pack: ${result.casePack} pack` : "",
    quoteDisplay.pricingProgram ? `Pricing Program: ${programPricing.programName}` : "",
    quoteDisplay.volume ? `${programPricing.volumeLabel}: ${programPricing.volumeValue}` : "",
    quoteDisplay.productionPeriod ? `${programPricing.periodLabel}: ${programPricing.periodValue}` : "",
    quoteDisplay.casesPerWeek ? `Cases Per Production Week: ${whole(result.weeklyCases)}` : "",
    `SKU Count: ${result.skuCount}`,
    `Max Weekly Capacity: ${whole(result.maxWeeklyCases)} cases`,
    `Line Weeks / Run: ${result.lineWeeksNeeded.toFixed(2)}`,
    pricingProgram === "annual" ? `Annual Capacity Utilization: ${percent(result.utilization)}` : "",
    pricingProgram === "flex" ? `Entered Tolling: ${money(programPricing.baseTolling, 4)} / can` : "",
    pricingProgram === "flex" ? `Flex Premium: ${money(programPricing.flexPremium, 4)} / can` : "",
    pricingProgram === "flex" ? `Customer Tolling: ${money(programPricing.customerTolling, 4)} / can` : "",
    pricingProgram === "flex" ? `Actual Flex Tolling Revenue: ${money(programPricing.flexRevenue, 2)}` : "",
    pricingProgram === "flex" ? `Minimum Day Revenue Target: ${money(programPricing.minimumRevenue, 2)}` : "",
    pricingProgram === "flex" ? `Revenue Shortfall: ${money(programPricing.capacityRecoveryShortfall, 2)}` : "",
    pricingProgram === "flex" ? `Recommended Recovery: ${money(programPricing.recommendedRecoveryPerCan, 4)} / can` : "",
    pricingProgram === "flex" ? `Recommended Customer Tolling: ${money(programPricing.recommendedFlexTolling, 4)} / can` : "",
    pricingProgram === "flex" ? `Flex Recovery Result: ${percent(programPricing.flexRecoveryPct, 2)}` : "",
    pricingProgram === "flex" ? `Flex Operational Grade: ${programPricing.flexOperationalGrade}` : "",
    quoteDisplay.facilityFee && pricingProgram === "trial" ? `Daily Facility Fee: ${money(programPricing.facilityRate, 2)}` : "",
    pricingProgram === "trial" ? `Trial Days Reserved: ${programPricing.trialDays}` : "",
    pricingProgram === "trial" ? `Required Revenue For Trial Days: ${money(programPricing.trialRequiredRevenue, 2)}` : "",
    pricingProgram === "trial" ? `Trial Recovery Result: ${percent(programPricing.trialRecoveryPct, 2)}` : "",
    pricingProgram === "trial" ? `Trial Operational Grade: ${programPricing.trialOperationalGrade}` : "",
    quoteDisplay.tolling ? `Tolling: ${money(programPricing.customerTolling, 4)} / can` : "",
    pricingProgram === "annual" ? `Recommended Tolling For Good: ${money(result.recommendedTolling, 4)} / can` : "",
    pricingProgram === "annual" ? `Recommended Increase: ${percent(result.recommendedIncreasePct)}` : "",
    `Materials Total: ${money(result.materialsPerCan, 4)} / can`,
    `Services Total: ${money(result.servicesPerCan, 4)} / can`,
    `Supplied COGS: ${money(result.suppliedCogsPerCan, 4)} / can`,
    quoteDisplay.pricePerCan ? `Estimated Total: ${money(programPricing.pricePerCan, 4)} / can` : "",
    quoteDisplay.pricePerCase ? `Estimated Total: ${money(programPricing.pricePerCase, 2)} / case` : "",
    pricingProgram !== "annual" ? `Estimated Campaign Product Total: ${money(programPricing.productionTotal, 2)}` : "",
    quoteDisplay.quoteTotal && pricingProgram === "trial" ? `Estimated Quote Total: ${money(programPricing.totalQuote, 2)}` : "",
    pricingProgram === "annual" ? `Weekly Revenue: ${money(result.weeklyRevenue, 2)}` : "",
    pricingProgram === "annual" ? `Weekly COGS Estimate: ${money(result.weeklyCogsEstimate, 2)}` : "",
    pricingProgram === "annual" ? `Weekly Contribution @ Low OH: ${money(result.estimatedWeeklyNet, 2)}` : "",
    pricingProgram === "annual" ? `Estimated Whole Run Net: ${money(result.estimatedWholeRunNet, 2)}` : "",
    pricingProgram === "annual" ? `OH Result: ${percent(result.ohResultPct, 2)}` : "",
    pricingProgram === "annual" ? `After Supplies: ${percent(result.afterSuppliesPct, 2)}` : "",
    pricingProgram === "annual" ? `Operational Grade: ${result.operationalGrade}` : "",
    customTermLines.length ? `Custom Terms:
${customTermLines.map((line) => `*${line}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");


  const internalFinancialHtml = `<!doctype html><html><head><title>Internal Financial Summary - ${escapeHtml(clientName)}</title><style>body{font-family:Calibri,Arial,sans-serif;color:#0f172a;padding:32px}.page{max-width:900px;margin:0 auto;border:1px solid #cbd5e1;padding:36px}h1{font-size:30px;margin:0}h2{font-size:18px;border-bottom:1px solid #cbd5e1;padding-bottom:6px;margin-top:28px}.muted{color:#64748b;font-size:13px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:28px}.line{display:flex;justify-content:space-between;gap:24px;padding:4px 0;font-size:14px}.strong{font-weight:700}.alert{background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:14px;margin-top:18px}.notes{border-top:1px solid #cbd5e1;margin-top:28px;padding-top:18px;font-size:12px;line-height:1.55;color:#475569}@media print{body{padding:0}.page{border:none}}</style></head><body><div class="page"><h1>Internal Financial Summary</h1><div class="muted">Manhattan, KS profitability review. Internal use only.</div><div class="grid" style="margin-top:20px;"><div><h2>Quote Setup</h2><div class="line"><span>Client</span><span class="strong">${escapeHtml(clientName)}</span></div><div class="line"><span>Pricing Program</span><span class="strong">${programPricing.programName}</span></div><div class="line"><span>Package</span><span class="strong">${escapeHtml(canSize)}</span></div><div class="line"><span>Case Pack</span><span class="strong">${result.casePack} pack</span></div><div class="line"><span>${programPricing.volumeLabel}</span><span class="strong">${programPricing.volumeValue}</span></div><div class="line"><span>${programPricing.periodLabel}</span><span class="strong">${programPricing.periodValue}</span></div></div><div><h2>Pricing</h2>${pricingProgram === "trial" ? `<div class="line"><span>Daily Facility Fee</span><span class="strong">${money(programPricing.facilityRate, 2)}</span></div>` : ""}${pricingProgram === "flex" ? `<div class="line"><span>Entered Tolling</span><span class="strong">${money(programPricing.baseTolling, 4)} / can</span></div><div class="line"><span>Flex Premium</span><span class="strong">${money(programPricing.flexPremium, 4)} / can</span></div>` : ""}<div class="line"><span>${pricingProgram === "flex" ? "Customer Tolling" : "Tolling"}</span><span class="strong">${money(programPricing.customerTolling, 4)} / can</span></div><div class="line"><span>Total Price / Can</span><span class="strong">${money(programPricing.pricePerCan, 4)}</span></div><div class="line"><span>Total Price / Case</span><span class="strong">${money(programPricing.pricePerCase, 2)}</span></div>${pricingProgram !== "annual" ? `<div class="line"><span>Campaign Product Total</span><span class="strong">${money(programPricing.productionTotal, 2)}</span></div>` : ""}${pricingProgram === "trial" ? `<div class="line"><span>Quote Total</span><span class="strong">${money(programPricing.totalQuote, 2)}</span></div>` : ""}</div></div><h2>Program Review</h2><div class="grid">${pricingProgram === "annual" ? `<div class="line"><span>Operational Grade</span><span class="strong">${result.operationalGrade}</span></div><div class="line"><span>OH Coverage Above Low Target</span><span class="strong">${percent(result.ohResultPct, 2)}</span></div><div class="line"><span>Contribution Above Low OH</span><span class="strong">${percent(result.afterSuppliesPct, 2)}</span></div><div class="line"><span>Weekly Revenue</span><span class="strong">${money(result.weeklyRevenue, 2)}</span></div><div class="line"><span>Weekly Supplied COGS</span><span class="strong">${money(result.weeklyCogsEstimate, 2)}</span></div><div class="line"><span>Weekly Contribution @ Low OH</span><span class="strong">${money(result.estimatedWeeklyNet, 2)}</span></div><div class="line"><span>Weekly Contribution @ High OH</span><span class="strong">${money(result.estimatedWeeklyContributionHighOH, 2)}</span></div><div class="line"><span>Annual Revenue</span><span class="strong">${money(result.annualRevenue, 2)}</span></div><div class="line"><span>Annual Contribution @ Low OH</span><span class="strong">${money(result.estimatedWholeRunNet, 2)}</span></div><div class="line"><span>Annual Contribution @ High OH</span><span class="strong">${money(result.estimatedAnnualContributionHighOH, 2)}</span></div><div class="line"><span>Break-Even Price @ Low OH</span><span class="strong">${money(result.lowOhBreakEvenPricePerCan, 4)} / can</span></div><div class="line"><span>Break-Even Price @ High OH</span><span class="strong">${money(result.highOhBreakEvenPricePerCan, 4)} / can</span></div><div class="line"><span>Pricing Cushion @ Low OH</span><span class="strong">${money(result.lowOhPricingCushionPerCan, 4)} / can</span></div><div class="line"><span>Pricing Cushion @ High OH</span><span class="strong">${money(result.highOhPricingCushionPerCan, 4)} / can</span></div><div class="line"><span>Recommended Tolling For Good</span><span class="strong">${money(result.recommendedTolling, 4)} / can</span></div><div class="line"><span>Recommended Increase</span><span class="strong">${percent(result.recommendedIncreasePct)}</span></div>` : ""}${pricingProgram === "flex" ? `<div class="line"><span>Actual Flex Tolling Revenue</span><span class="strong">${money(programPricing.flexRevenue, 2)}</span></div><div class="line"><span>Minimum Day Revenue Target</span><span class="strong">${money(programPricing.minimumRevenue, 2)}</span></div><div class="line"><span>Revenue Shortfall</span><span class="strong">${money(programPricing.capacityRecoveryShortfall, 2)}</span></div><div class="line"><span>Recommended Recovery / Can</span><span class="strong">${money(programPricing.recommendedRecoveryPerCan, 4)}</span></div><div class="line"><span>Recommended Customer Tolling</span><span class="strong">${money(programPricing.recommendedFlexTolling, 4)}</span></div><div class="line"><span>Flex Operational Grade</span><span class="strong">${programPricing.flexOperationalGrade}</span></div>` : ""}${pricingProgram === "trial" ? `<div class="line"><span>Required Revenue</span><span class="strong">${money(programPricing.trialRequiredRevenue, 2)}</span></div><div class="line"><span>Trial Recovery Result</span><span class="strong">${percent(programPricing.trialRecoveryPct, 2)}</span></div><div class="line"><span>Trial Operational Grade</span><span class="strong">${programPricing.trialOperationalGrade}</span></div>` : ""}</div><h2>Cost and Capacity Detail</h2><div class="grid"><div class="line"><span>Entered Tolling / Can</span><span class="strong">${money(result.tolling, 4)}</span></div><div class="line"><span>Included Bev-Hub Cost / Can</span><span class="strong">${money(result.includedInToll, 4)}</span></div><div class="line"><span>Materials / Can</span><span class="strong">${money(result.materialsPerCan, 4)}</span></div><div class="line"><span>Services / Can</span><span class="strong">${money(result.servicesPerCan, 4)}</span></div><div class="line"><span>Supplied COGS / Can</span><span class="strong">${money(result.suppliedCogsPerCan, 4)}</span></div><div class="line"><span>COGS Buffer</span><span class="strong">${percent(result.cogsBuffer, 1)}</span></div><div class="line"><span>Low Weekly OH</span><span class="strong">${money(result.lowWeeklyOH, 2)}</span></div><div class="line"><span>High Weekly OH</span><span class="strong">${money(result.highWeeklyOH, 2)}</span></div><div class="line"><span>Cases / Production Week</span><span class="strong">${whole(result.weeklyCases)}</span></div><div class="line"><span>Cans / Production Week</span><span class="strong">${whole(result.weeklyCans)}</span></div><div class="line"><span>Average Cases / SKU / Week</span><span class="strong">${whole(result.casesPerSkuPerWeek)}</span></div><div class="line"><span>Weekly Capacity Assumption</span><span class="strong">${whole(result.maxWeeklyCases)} cases</span></div><div class="line"><span>Line Weeks / Run</span><span class="strong">${result.lineWeeksNeeded.toFixed(2)}</span></div><div class="line"><span>Total Annual Line Weeks</span><span class="strong">${result.totalAnnualLineWeeks.toFixed(2)}</span></div><div class="line"><span>Annual Line Capacity Utilization</span><span class="strong">${percent(result.utilization, 1)}</span></div></div><div class="alert"><div class="strong">${pricingProgram === "annual" ? `Review Status: ${result.status}` : programPricing.note}</div>${pricingProgram === "annual" ? `<div>${escapeHtml(result.statusNote)}</div>` : ""}</div><div class="notes"><p>This financial summary is for internal Bev-Hub review only and should not be shared externally. Contribution metrics are internal planning measures based on the OH and supplied COGS assumptions shown above; they are not accounting net income.</p></div></div></body></html>`;

  const csvText = csvRowsToText([
    ["Field", "Value"],
    ["Client", clientName],
    ["Pricing Program", programPricing.programName],
    ["Package", canSize],
    ["Case Pack", `${result.casePack} pack`],
    [programPricing.volumeLabel, programPricing.volumeValue],
    [programPricing.periodLabel, programPricing.periodValue],
    ["Cases Per Production Week", result.weeklyCases],
    ["SKU Count", result.skuCount],
    ["Max Weekly Capacity", result.maxWeeklyCases],
    ["Line Weeks / Run", result.lineWeeksNeeded],
    ["Utilization", percent(result.utilization)],
    ["Daily Facility Fee", pricingProgram === "trial" ? programPricing.facilityRate : ""],
    ["Actual Flex Tolling Revenue", pricingProgram === "flex" ? programPricing.flexRevenue : ""],
    ["Flex Recovery Result", pricingProgram === "flex" ? percent(programPricing.flexRecoveryPct, 2) : ""],
    ["Flex Operational Grade", pricingProgram === "flex" ? programPricing.flexOperationalGrade : ""],
    ["Recommended Customer Tolling", pricingProgram === "flex" ? programPricing.recommendedFlexTolling : ""],
    ["Recommended Recovery Per Can", pricingProgram === "flex" ? programPricing.recommendedRecoveryPerCan : ""],
    ["Recommended Increase", pricingProgram === "flex" ? percent(programPricing.flexRecommendedIncreasePct) : ""],
    ["Customer Tolling Per Can", programPricing.customerTolling],
    ["Estimated Product Total", pricingProgram === "trial" ? programPricing.productionTotal : ""],
    ["Estimated Quote Total", pricingProgram === "trial" ? programPricing.totalQuote : ""],
    ["Trial Days Reserved", pricingProgram === "trial" ? programPricing.trialDays : ""],
    ["Required Revenue For Trial Days", pricingProgram === "trial" ? programPricing.trialRequiredRevenue : ""],
    ["Trial Recovery Result", pricingProgram === "trial" ? percent(programPricing.trialRecoveryPct, 2) : ""],
    ["Trial Operational Grade", pricingProgram === "trial" ? programPricing.trialOperationalGrade : ""],
    ["Base Tolling Per Can", programPricing.baseTolling],
    ["Recommended Recovery Per Can", programPricing.dayRecoveryPerCan],
    ["Flex Premium Per Can", programPricing.flexPremium],
    ["Revenue Shortfall", programPricing.dayRecoveryFee],
    ["Recommended Tolling For Good", pricingProgram === "annual" ? result.recommendedTolling : ""],
    ["Recommended Increase", percent(result.recommendedIncreasePct)],
    ["Materials Per Can", result.materialsPerCan],
    ["Services Per Can", result.servicesPerCan],
    ["Supplied COGS Per Can", result.suppliedCogsPerCan],
    ["Estimated Price Per Can", programPricing.pricePerCan],
    ["Estimated Price Per Case", programPricing.pricePerCase],
    ["Weekly Revenue", result.weeklyRevenue],
    ["Weekly COGS Estimate", result.weeklyCogsEstimate],
    ["Weekly Contribution @ Low OH", result.estimatedWeeklyNet],
    ["Estimated Whole Run Net", result.estimatedWholeRunNet],
    ["OH Coverage Above Low Target", percent(result.ohResultPct, 2)],
    ["Contribution Above Low OH", percent(result.afterSuppliesPct, 2)],
    ["Operational Grade", result.operationalGrade],
    ["Cans + Ends", modeLabel(canEndMode)],
    ["Trays", modeLabel(trayMode)],
    ["Case Labels", modeLabel(caseLabelMode)],
    ["Pallet Materials", modeLabel(palletMode)],
    ["Sleeve Application", modeLabel(sleeveMode)],
    ["Carton Application", modeLabel(cartonMode)],
    ["Custom Terms", customTermLines.map((line) => `*${line}`).join("\n")],
  ]);

  const quoteText = [
    "Pricing Quote Summary",
    quoteDisplay.client ? `Client: ${clientName}` : "",
    quoteDisplay.package ? `Package: ${canSize}` : "",
    quoteDisplay.casePack ? `Case Pack: ${result.casePack} pack` : "",
    `Pricing Program: ${programPricing.programName}`,
    `${programPricing.volumeLabel}: ${programPricing.volumeValue}`,
    `${programPricing.periodLabel}: ${programPricing.periodValue}`,
    quoteDisplay.equivalentCases && pricingProgram !== "annual" ? `Equivalent Cases: ${calculatedEquivalentCases}` : "",
    `Cases Per Production Week: ${whole(result.weeklyCases)}`,
    pricingProgram === "trial" ? `Daily Facility Fee: ${money(programPricing.facilityRate, 2)}` : "",
    `Tolling: ${money(programPricing.customerTolling, 4)} / can`,
    `Estimated Total: ${money(programPricing.pricePerCan, 4)} / can`,
    `Estimated Total: ${money(programPricing.pricePerCase, 2)} / case`,
    quoteDisplay.productTotal && pricingProgram === "trial" ? `Estimated Product Total: ${money(programPricing.productionTotal, 2)}` : "",
    pricingProgram === "trial" ? `Estimated Quote Total: ${money(programPricing.totalQuote, 2)}` : "",
    pricingProgram === "annual" ? `Operational Grade: ${result.operationalGrade}` : "",
    pricingProgram === "annual" ? `OH Result: ${percent(result.ohResultPct, 2)}` : "",
    pricingProgram === "annual" ? `After Supplies: ${percent(result.afterSuppliesPct, 2)}` : "",
    pricingProgram === "flex" ? `Flex Operational Grade: ${programPricing.flexOperationalGrade}` : "",
    pricingProgram === "flex" ? `Flex Recovery Result: ${percent(programPricing.flexRecoveryPct, 2)}` : "",
    pricingProgram === "flex" ? `Revenue Shortfall: ${money(programPricing.capacityRecoveryShortfall, 2)}` : "",
    pricingProgram === "flex" ? `Recommended Customer Tolling: ${money(programPricing.recommendedFlexTolling, 4)} / can` : "",
    pricingProgram === "trial" ? `Trial Operational Grade: ${programPricing.trialOperationalGrade}` : "",
    pricingProgram === "trial" ? `Trial Recovery Result: ${percent(programPricing.trialRecoveryPct, 2)}` : "",
    pricingProgram === "annual" ? `Weekly Revenue: ${money(result.weeklyRevenue, 2)}` : "",
    pricingProgram === "annual" ? `Weekly Contribution @ Low OH: ${money(result.estimatedWeeklyNet, 2)}` : "",
    pricingProgram === "annual" ? `Estimated Whole Run Net: ${money(result.estimatedWholeRunNet, 2)}` : "",
    quoteDisplay.customTerms && customTermLines.length ? `Custom Terms:\n${customTermLines.map((line) => `*${line}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");

  function safeFileName(value) {
    return String(value || "Quote").replace(/[^a-z0-9-_ ]/gi, "_").trim() || "Quote";
  }

  function dataHref(content, type) {
    return `data:${type};charset=utf-8,${encodeURIComponent(content)}`;
  }

  async function downloadHtmlAsPdf(html, filename) {
    const wrapper = document.createElement("div");
    wrapper.style.position = "fixed";
    wrapper.style.left = "-10000px";
    wrapper.style.top = "0";
    wrapper.style.width = "900px";
    wrapper.style.background = "white";
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);

    try {
      const target = wrapper.querySelector(".page") || wrapper;
      const canvas = await html2canvas(target, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const pagePixels = Math.floor(canvas.width * pdfHeight / pdfWidth);
      const targetRect = target.getBoundingClientRect();
      const scale = canvas.width / targetRect.width;
      // Preserve the existing rendering, but cut between rows/paragraphs and
      // keep each signature section together when it fits on a page.
      const blocks = Array.from(target.querySelectorAll(".signature, .line, p, h1, h2"))
        .filter((element) => !element.parentElement.closest(".signature"))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { top: Math.floor((rect.top - targetRect.top) * scale), bottom: Math.ceil((rect.bottom - targetRect.top) * scale) };
        });
      let start = 0;
      while (start < canvas.height) {
        let end = Math.min(start + pagePixels, canvas.height);
        // A row in either column may cross the other column's proposed break.
        let crossing;
        while ((crossing = blocks.find((block) => block.top > start && block.top < end && block.bottom > end))) {
          end = crossing.top;
        }
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = end - start;
        slice.getContext("2d").drawImage(canvas, 0, start, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
        if (start > 0) pdf.addPage();
        pdf.addImage(slice.toDataURL("image/png"), "PNG", 0, 0, pdfWidth, slice.height * pdfWidth / canvas.width);
        start = end;
      }

      pdf.save(filename);
    } finally {
      document.body.removeChild(wrapper);
    }
  }

  function downloadClientPDF() {
    downloadHtmlAsPdf(clientQuoteHtml, `Client Quote - ${safeFileName(clientName)}.pdf`);
  }

  function downloadInternalPDF() {
    downloadHtmlAsPdf(internalFinancialHtml, `Internal Financial Summary - ${safeFileName(clientName)}.pdf`);
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

  function printInternalFinancials() {
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(internalFinancialHtml);
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

  function nextQuoteNumber() {
    const highest = savedQuotes.reduce((max, quote) => {
      const match = String(quote.quoteNumber || "").match(/BH-(\d+)/i);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `BH-${String(highest + 1).padStart(3, "0")}`;
  }

  function currentQuoteSnapshot(existingQuoteNumber = null, existingStatus = "Draft") {
    const totalQuoteValue = pricingProgram === "annual"
      ? result.annualRevenue
      : pricingProgram === "flex"
        ? programPricing.productionTotal
        : programPricing.totalQuote;

    return {
      quoteNumber: existingQuoteNumber || nextQuoteNumber(),
      status: existingStatus || "Draft",
      clientName, annualCases, productionWeeksPerYear, skuCount, casePack, canSize, tolling, casesPerPallet,
      canEndMode, trayMode, caseLabelMode, palletMode, sleeveMode, cartonMode,
      canEndCostPerCan, trayCostPerCase, caseLabelCostPerCase, palletMaterialCostPerPallet, sleeveCostPerCan, cartonCostPerCan,
      weeklyOutput12Pack, weeklyOutput24Pack, lowWeeklyOH, highWeeklyOH, cogsBuffer, customTerms,
      pricingProgram, campaignCans, minDayRevenueTarget, flexPremiumPerCan, trialFacilityRate, trialExpectedCans, trialDaysReserved,
      quoteDisplay,
      summary: {
        programName: programPricing.programName,
        package: canSize,
        volume: programPricing.volumeValue,
        totalQuote: totalQuoteValue || 0,
      },
    };
  }

  function saveCurrentQuote() {
    const now = new Date().toISOString();
    if (activeSavedQuoteId) {
      setSavedQuotes((current) => current.map((quote) => {
        if (quote.id !== activeSavedQuoteId) return quote;
        return {
          ...currentQuoteSnapshot(quote.quoteNumber, quote.status),
          id: quote.id,
          createdAt: quote.createdAt || now,
          updatedAt: now,
        };
      }));
      setSaveNotice("Saved quote updated.");
    } else {
      const newQuote = {
        ...currentQuoteSnapshot(),
        id: `quote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: now,
        updatedAt: now,
      };
      setSavedQuotes((current) => [newQuote, ...current]);
      setActiveSavedQuoteId(newQuote.id);
      setSaveNotice(`${newQuote.quoteNumber} saved.`);
    }
    window.setTimeout(() => setSaveNotice(""), 2500);
  }

  function loadSavedQuote(quote, duplicate = false) {
    setClientName(quote.clientName ?? "Client Name");
    setAnnualCases(quote.annualCases ?? "300000");
    setProductionWeeksPerYear(quote.productionWeeksPerYear ?? "2");
    setSkuCount(quote.skuCount ?? "2");
    setCasePack(quote.casePack ?? "24");
    setCanSize(quote.canSize ?? "250 ml Slim");
    setTolling(quote.tolling ?? "0.40045");
    setCasesPerPallet(quote.casesPerPallet ?? "91");
    setCanEndMode(quote.canEndMode ?? "clientSupplied");
    setTrayMode(quote.trayMode ?? "clientSupplied");
    setCaseLabelMode(quote.caseLabelMode ?? "clientSupplied");
    setPalletMode(quote.palletMode ?? "clientSupplied");
    setSleeveMode(quote.sleeveMode ?? "notNeeded");
    setCartonMode(quote.cartonMode ?? "notNeeded");
    setCanEndCostPerCan(quote.canEndCostPerCan ?? "0.1681");
    setTrayCostPerCase(quote.trayCostPerCase ?? "0.2544");
    setCaseLabelCostPerCase(quote.caseLabelCostPerCase ?? "0.011");
    setPalletMaterialCostPerPallet(quote.palletMaterialCostPerPallet ?? "13.03");
    setSleeveCostPerCan(quote.sleeveCostPerCan ?? "0.10");
    setCartonCostPerCan(quote.cartonCostPerCan ?? "0.0225");
    setWeeklyOutput12Pack(quote.weeklyOutput12Pack ?? "75000");
    setWeeklyOutput24Pack(quote.weeklyOutput24Pack ?? "37500");
    setLowWeeklyOH(quote.lowWeeklyOH ?? "250000");
    setHighWeeklyOH(quote.highWeeklyOH ?? "350000");
    setCogsBuffer(quote.cogsBuffer ?? "0");
    setCustomTerms(quote.customTerms ?? "");
    setPricingProgram(quote.pricingProgram ?? "annual");
    setCampaignCans(quote.campaignCans ?? "125000");
    setMinDayRevenueTarget(quote.minDayRevenueTarget ?? "60000");
    setFlexPremiumPerCan(quote.flexPremiumPerCan ?? "0.02");
    setTrialFacilityRate(quote.trialFacilityRate ?? "25000");
    setTrialExpectedCans(quote.trialExpectedCans ?? "15000");
    setTrialDaysReserved(quote.trialDaysReserved ?? "1");
    if (quote.quoteDisplay) setQuoteDisplay({ ...RECOMMENDED_QUOTE_DISPLAY, ...quote.quoteDisplay });
    setActiveSavedQuoteId(duplicate ? null : quote.id);
    setSaveNotice(duplicate ? `Loaded a copy of ${quote.quoteNumber}. Save to create a new quote.` : `${quote.quoteNumber} loaded.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => setSaveNotice(""), 3000);
  }

  function deleteSavedQuote(id) {
    const quote = savedQuotes.find((item) => item.id === id);
    if (!quote) return;
    if (typeof window !== "undefined" && !window.confirm(`Delete ${quote.quoteNumber} for ${quote.clientName}?`)) return;
    setSavedQuotes((current) => current.filter((item) => item.id !== id));
    if (activeSavedQuoteId === id) setActiveSavedQuoteId(null);
  }

  function updateSavedQuoteStatus(id, status) {
    setSavedQuotes((current) => current.map((quote) => quote.id === id ? { ...quote, status, updatedAt: new Date().toISOString() } : quote));
  }

  function startNewQuote() {
    setActiveSavedQuoteId(null);
    setSaveNotice("New quote mode. Your current calculator values were left in place.");
    window.setTimeout(() => setSaveNotice(""), 2500);
  }

  const filteredSavedQuotes = savedQuotes.filter((quote) => {
    const search = savedQuoteSearch.trim().toLowerCase();
    const matchesSearch = !search || [quote.quoteNumber, quote.clientName, quote.summary?.programName, quote.summary?.package]
      .some((value) => String(value || "").toLowerCase().includes(search));
    const matchesStatus = savedQuoteStatusFilter === "All" || quote.status === savedQuoteStatusFilter;
    return matchesSearch && matchesStatus;
  });

  if (!isAuthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-900">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">Bev-Hub Quote Tool</h1>
            <p className="mt-2 text-sm text-slate-600">
              Enter the internal password to access the Manhattan pricing calculator.
            </p>
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">Password</span>
            <input
              type="password"
              value={passwordInput}
              onChange={(event) => {
                setPasswordInput(event.target.value);
                setLoginError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleLogin();
              }}
              placeholder="Enter password"
              className="w-full rounded-xl border px-4 py-3 text-sm"
              autoFocus
            />
          </label>

          {loginError && <div className="mt-3 text-sm font-medium text-red-600">{loginError}</div>}

          <button
            type="button"
            onClick={handleLogin}
            className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Login
          </button>

          <p className="mt-4 text-xs text-slate-500">
            Access expires after 8 hours or when you log out.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-2xl border bg-white p-5 shadow-sm md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Bev-Hub Quote Calculator MHK v6.7 Financial Intelligence</h1>
            <p className="text-xs font-semibold text-green-700">Version: MHK v6.6 Saved Quote Library</p>
            <p className="mt-2 text-sm text-slate-600">
              Manhattan-only pricing tool. Standard weekly output is 75,000 12-pack cases or 37,500 24-pack cases. Weekly output can be adjusted if operations confirms a different run rate.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={startNewQuote}
              className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              New Quote
            </button>
            <button
              type="button"
              onClick={saveCurrentQuote}
              className="rounded-xl bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800"
            >
              {activeSavedQuoteId ? "Update Saved Quote" : "Save Quote"}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              Logout
            </button>
          </div>
        </header>

        {saveNotice && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
            {saveNotice}
          </div>
        )}

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Saved Quotes / Quick Reference</h2>
              <p className="mt-1 text-sm text-slate-500">Quotes are saved in this browser so you can reopen and reference them without downloading a file.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={savedQuoteSearch}
                onChange={(event) => setSavedQuoteSearch(event.target.value)}
                placeholder="Search client or quote #"
                className="rounded-xl border px-3 py-2 text-sm sm:w-64"
              />
              <select
                value={savedQuoteStatusFilter}
                onChange={(event) => setSavedQuoteStatusFilter(event.target.value)}
                className="rounded-xl border px-3 py-2 text-sm"
              >
                {['All', 'Draft', 'Sent', 'Approved', 'Declined', 'Expired'].map((status) => <option key={status}>{status}</option>)}
              </select>
            </div>
          </div>

          {filteredSavedQuotes.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-slate-50 p-6 text-center text-sm text-slate-500">
              {savedQuotes.length === 0 ? 'No saved quotes yet. Build a quote and click Save Quote.' : 'No saved quotes match your search or filter.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-slate-900 text-white">
                    <th className="px-3 py-3 font-semibold">Quote #</th>
                    <th className="px-3 py-3 font-semibold">Client / Brand</th>
                    <th className="px-3 py-3 font-semibold">Program</th>
                    <th className="px-3 py-3 font-semibold">Package</th>
                    <th className="px-3 py-3 font-semibold">Volume</th>
                    <th className="px-3 py-3 font-semibold">Quote Total</th>
                    <th className="px-3 py-3 font-semibold">Updated</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSavedQuotes.map((quote) => (
                    <tr key={quote.id} className={`border-b last:border-0 ${activeSavedQuoteId === quote.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                      <td className="whitespace-nowrap px-3 py-3 font-semibold text-blue-700">{quote.quoteNumber}</td>
                      <td className="px-3 py-3 font-medium">{quote.clientName}</td>
                      <td className="px-3 py-3">{quote.summary?.programName || '—'}</td>
                      <td className="px-3 py-3">{quote.summary?.package || quote.canSize}</td>
                      <td className="whitespace-nowrap px-3 py-3">{quote.summary?.volume || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3 font-semibold">{money(quote.summary?.totalQuote || 0, 2)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">{new Date(quote.updatedAt || quote.createdAt).toLocaleDateString()}</td>
                      <td className="px-3 py-3">
                        <select
                          value={quote.status || 'Draft'}
                          onChange={(event) => updateSavedQuoteStatus(quote.id, event.target.value)}
                          className="rounded-lg border px-2 py-1 text-xs font-semibold"
                        >
                          {['Draft', 'Sent', 'Approved', 'Declined', 'Expired'].map((status) => <option key={status}>{status}</option>)}
                        </select>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => loadSavedQuote(quote)} className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold hover:bg-white">Open</button>
                          <button type="button" onClick={() => loadSavedQuote(quote, true)} className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold hover:bg-white">Duplicate</button>
                          <button type="button" onClick={() => deleteSavedQuote(quote.id)} className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>{filteredSavedQuotes.length} of {savedQuotes.length} saved quote{savedQuotes.length === 1 ? '' : 's'}</span>
            <span>Browser storage only. Clearing site data can remove this list.</span>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold">Quote Inputs</h2>
            <div className="space-y-5">
              <TextInput label="Client / Brand" value={clientName} onChange={setClientName} />

              <SelectInput
                label="Pricing Program"
                value={pricingProgram}
                onChange={setPricingProgram}
                options={["annual", "flex", "trial"]}
                labels={{ annual: "Annual Contract", flex: "Flex Commercial Production", trial: "Commercial Trial Program" }}
              />

              {pricingProgram === "flex" && (
                <div className="rounded-xl border p-4">
                  <h3 className="mb-3 text-sm font-semibold">Flex Commercial Production</h3>
                  <p className="mb-3 text-xs text-slate-500">Used for one-day or below-MOQ commercial runs outside an annual production agreement.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <TextInput label="Campaign Cans" value={campaignCans} onChange={setCampaignCans} type="number" />
                    <TextInput label="Minimum Day Revenue Target" value={minDayRevenueTarget} onChange={setMinDayRevenueTarget} type="number" />
                    <TextInput label="Flex Premium $ / Can" value={flexPremiumPerCan} onChange={setFlexPremiumPerCan} type="number" step="0.0001" />
                  </div>
                </div>
              )}

              {pricingProgram === "trial" && (
                <div className="rounded-xl border p-4">
                  <h3 className="mb-3 text-sm font-semibold">Commercial Trial Program</h3>
                  <p className="mb-3 text-xs text-slate-500">Used for a scheduled commercial trial day with a separate daily facility fee plus independent tolling and consumables.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <TextInput label="Daily Facility Fee" value={trialFacilityRate} onChange={setTrialFacilityRate} type="number" />
                    <TextInput label="Expected Cans" value={trialExpectedCans} onChange={setTrialExpectedCans} type="number" />
                    <TextInput label="Trial Days Reserved" value={trialDaysReserved} onChange={setTrialDaysReserved} type="number" />
                    <TextInput label="Minimum Day Revenue Target" value={minDayRevenueTarget} onChange={setMinDayRevenueTarget} type="number" />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <TextInput label={pricingProgram === "annual" ? "Annual Cases" : "Equivalent Cases"} value={pricingProgram === "annual" ? annualCases : calculatedEquivalentCases} onChange={pricingProgram === "annual" ? setAnnualCases : () => {}} type="number" readOnly={pricingProgram !== "annual"} />
                <TextInput label={pricingProgram === "annual" ? "Production Weeks / Year" : "Production Days Reserved"} value={pricingProgram === "annual" ? productionWeeksPerYear : "1"} onChange={pricingProgram === "annual" ? setProductionWeeksPerYear : () => {}} type="number" />
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
                <p className="mb-3 text-xs text-slate-500">Adjust only if operations confirms a different weekly run rate.</p>
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
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">Manufacturing Quote Display Options</h3>
                    <p className="mt-1 text-xs text-slate-500">Controls the on-screen client quote, downloaded HTML, PDF, printout, and copied quote summary.</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={useRecommendedQuoteLayout} className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-slate-50">Recommended Layout</button>
                    <button type="button" onClick={showAllQuoteFields} className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-slate-50">Show All</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                  <QuoteToggle label="Client Name" checked={quoteDisplay.client} onChange={(v) => setQuoteOption("client", v)} />
                  <QuoteToggle label="Package" checked={quoteDisplay.package} onChange={(v) => setQuoteOption("package", v)} />
                  <QuoteToggle label="Case Pack" checked={quoteDisplay.casePack} onChange={(v) => setQuoteOption("casePack", v)} />
                  <QuoteToggle label="Pricing Program" checked={quoteDisplay.pricingProgram} onChange={(v) => setQuoteOption("pricingProgram", v)} />
                  <QuoteToggle label="Volume" checked={quoteDisplay.volume} onChange={(v) => setQuoteOption("volume", v)} />
                  <QuoteToggle label="Production Period" checked={quoteDisplay.productionPeriod} onChange={(v) => setQuoteOption("productionPeriod", v)} />
                  <QuoteToggle label="Equivalent Cases" checked={quoteDisplay.equivalentCases} onChange={(v) => setQuoteOption("equivalentCases", v)} disabled={pricingProgram === "annual"} />
                  <QuoteToggle label="Cases / Production Week" checked={quoteDisplay.casesPerWeek} onChange={(v) => setQuoteOption("casesPerWeek", v)} />
                  <QuoteToggle label="Line Weeks / Run" checked={quoteDisplay.lineWeeksNeeded} onChange={(v) => setQuoteOption("lineWeeksNeeded", v)} />
                  <QuoteToggle label="Daily Facility Fee" checked={quoteDisplay.facilityFee} onChange={(v) => setQuoteOption("facilityFee", v)} disabled={pricingProgram !== "trial"} />
                  <QuoteToggle label="Tolling" checked={quoteDisplay.tolling} onChange={(v) => setQuoteOption("tolling", v)} />
                  <QuoteToggle label="Materials Pricing" checked={quoteDisplay.materials} onChange={(v) => setQuoteOption("materials", v)} />
                  <QuoteToggle label="Additional Services Pricing" checked={quoteDisplay.services} onChange={(v) => setQuoteOption("services", v)} />
                  <QuoteToggle label="Price / Can" checked={quoteDisplay.pricePerCan} onChange={(v) => setQuoteOption("pricePerCan", v)} />
                  <QuoteToggle label="Price / Case" checked={quoteDisplay.pricePerCase} onChange={(v) => setQuoteOption("pricePerCase", v)} />
                  <QuoteToggle label="Product or Campaign Total" checked={quoteDisplay.productTotal} onChange={(v) => setQuoteOption("productTotal", v)} disabled={pricingProgram === "annual"} />
                  <QuoteToggle label="Total Quote" checked={quoteDisplay.quoteTotal} onChange={(v) => setQuoteOption("quoteTotal", v)} disabled={pricingProgram !== "trial"} />
                  <QuoteToggle label="Materials and Services Section" checked={quoteDisplay.materialsSection} onChange={(v) => setQuoteOption("materialsSection", v)} />
                  <QuoteToggle label="Standard Terms" checked={quoteDisplay.standardTerms} onChange={(v) => setQuoteOption("standardTerms", v)} />
                  <QuoteToggle label="Commercialization Term" checked={quoteDisplay.commercializationTerm} onChange={(v) => setQuoteOption("commercializationTerm", v)} />
                  <QuoteToggle label="Warehousing" checked={quoteDisplay.warehousing} onChange={(v) => setQuoteOption("warehousing", v)} />
                  <QuoteToggle label="Custom Terms" checked={quoteDisplay.customTerms} onChange={(v) => setQuoteOption("customTerms", v)} />
                  <QuoteToggle label="Signature Section" checked={quoteDisplay.signatures} onChange={(v) => setQuoteOption("signatures", v)} />
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
              </div>
            </div>
          </section>

          <main className="space-y-6 lg:col-span-2">
            <section className="grid grid-cols-1 gap-4 md:grid-cols-5">
              <Kpi title="Cases / Production Week" value={whole(result.weeklyCases)} />
              <Kpi title="Line Weeks / Run" value={result.lineWeeksNeeded.toFixed(2)} />
              <Kpi title="Max Weekly" value={`${whole(result.maxWeeklyCases)} cases`} />
              <Kpi title={pricingProgram === "annual" ? "Annual Line Weeks" : "Campaign Cases"} value={pricingProgram === "annual" ? result.totalAnnualLineWeeks.toFixed(2) : whole(calculatedEquivalentCases)} />
              <Kpi
                title={pricingProgram === "annual" ? "Annual Revenue" : pricingProgram === "flex" ? "Campaign Revenue" : "Quote Total"}
                value={pricingProgram === "annual" ? money(result.annualRevenue, 2) : pricingProgram === "flex" ? money(programPricing.productionTotal, 2) : money(programPricing.totalQuote, 2)}
              />
            </section>

            <Panel title="Pricing Output" action={<button onClick={copyQuote} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Copy Quote Summary</button>}>
              <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                <a href={dataHref(clientQuoteHtml, "text/html")} download={`Client Quote - ${safeFileName(clientName)}.html`} className="rounded-xl border bg-white px-3 py-2 text-center text-sm font-semibold hover:bg-slate-50">Download Client Quote</a>
                <button type="button" onClick={downloadClientPDF} className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50">Download Client PDF</button>
                <button type="button" onClick={printClientQuote} className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50">Print Client Quote</button>
                <a href={dataHref(internalFinancialHtml, "text/html")} download={`Internal Financial Summary - ${safeFileName(clientName)}.html`} className="rounded-xl border bg-white px-3 py-2 text-center text-sm font-semibold hover:bg-slate-50">Download Internal Financials</a>
                <button type="button" onClick={downloadInternalPDF} className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50">Download Internal PDF</button>
                <button type="button" onClick={printInternalFinancials} className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50">Print Internal Financials</button>
                <a href={dataHref(internalSummaryText, "text/plain")} download={`Internal Quote Calculation - ${safeFileName(clientName)}.txt`} className="rounded-xl border bg-white px-3 py-2 text-center text-sm font-semibold hover:bg-slate-50">Download Internal Text</a>
                <a href={dataHref(csvText, "text/csv")} download={`Quote Calculation - ${safeFileName(clientName)}.csv`} className="rounded-xl border bg-white px-3 py-2 text-center text-sm font-semibold hover:bg-slate-50">Export CSV</a>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {pricingProgram === "trial" && <Output label="Daily Facility Fee" value={money(programPricing.facilityRate, 2)} />}
                {pricingProgram === "trial" && <Output label="Estimated Product Total" value={money(programPricing.productionTotal, 2)} />}
                {pricingProgram === "trial" && <Output label="Estimated Quote Total" value={money(programPricing.totalQuote, 2)} />}
                {pricingProgram === "trial" && <Output label="Trial Operational Grade" value={programPricing.trialOperationalGrade} />}
                {pricingProgram === "trial" && <Output label="Trial Recovery Result" value={percent(programPricing.trialRecoveryPct, 2)} />}

                {pricingProgram === "flex" && <Output label="Actual Flex Tolling Revenue" value={money(programPricing.flexRevenue, 2)} />}
                {pricingProgram === "flex" && <Output label="Minimum Day Revenue Target" value={money(programPricing.minimumRevenue, 2)} />}
                {pricingProgram === "flex" && <Output label="Flex Recovery Result" value={percent(programPricing.flexRecoveryPct, 2)} />}
                {pricingProgram === "flex" && <Output label="Flex Operational Grade" value={programPricing.flexOperationalGrade} />}
                {pricingProgram === "flex" && <Output label="Recommended Customer Tolling" value={`${money(programPricing.recommendedFlexTolling, 4)} / can`} />}
                {pricingProgram === "flex" && <Output label="Recommended Increase" value={`${money(programPricing.recommendedRecoveryPerCan, 4)} / can (${percent(programPricing.flexRecommendedIncreasePct)})`} />}

                <Output label="Tolling" value={`${money(programPricing.customerTolling, 4)} / can`} />
                <Output label="Materials" value={`${money(result.materialsPerCan, 4)} / can`} />
                <Output label="Supplied COGS" value={`${money(result.suppliedCogsPerCan, 4)} / can`} />
                <Output label="Additional Services" value={`${money(result.servicesPerCan, 4)} / can`} />
                <Output label="Estimated Total" value={`${money(programPricing.pricePerCan, 4)} / can`} />
                <Output label="Estimated Total" value={`${money(programPricing.pricePerCase, 2)} / case`} />

                {pricingProgram === "annual" && <Output label="Recommended Tolling For Good" value={`${money(result.recommendedTolling, 4)} / can`} />}
                {pricingProgram === "annual" && <Output label="Recommended Increase" value={percent(result.recommendedIncreasePct)} />}
                {pricingProgram === "annual" && <Output label="Operational Grade" value={result.operationalGrade} />}
                {pricingProgram === "annual" && <Output label="OH Coverage Above Low Target" value={percent(result.ohResultPct, 2)} />}
                {pricingProgram === "annual" && <Output label="Contribution Above Low OH" value={percent(result.afterSuppliesPct, 2)} />}
                {pricingProgram === "annual" && <Output label="Weekly Revenue" value={money(result.weeklyRevenue, 2)} />}
                {pricingProgram === "annual" && <Output label="Weekly COGS Estimate" value={money(result.weeklyCogsEstimate, 2)} />}
                {pricingProgram === "annual" && <Output label="Weekly Contribution @ Low OH" value={money(result.estimatedWeeklyNet, 2)} />}
                {pricingProgram === "annual" && <Output label="Weekly Contribution @ High OH" value={money(result.estimatedWeeklyContributionHighOH, 2)} />}
                {pricingProgram === "annual" && <Output label="Annual Contribution @ Low OH" value={money(result.estimatedWholeRunNet, 2)} />}
                {pricingProgram === "annual" && <Output label="Annual Contribution @ High OH" value={money(result.estimatedAnnualContributionHighOH, 2)} />}
                {pricingProgram === "annual" && <Output label="Break-Even Price @ Low OH" value={`${money(result.lowOhBreakEvenPricePerCan, 4)} / can`} />}
                {pricingProgram === "annual" && <Output label="Break-Even Price @ High OH" value={`${money(result.highOhBreakEvenPricePerCan, 4)} / can`} />}
                {pricingProgram === "annual" && <Output label="Pricing Cushion @ Low OH" value={`${money(result.lowOhPricingCushionPerCan, 4)} / can`} />}
                {pricingProgram === "annual" && <Output label="Pricing Cushion @ High OH" value={`${money(result.highOhPricingCushionPerCan, 4)} / can`} />}
                {pricingProgram === "annual" && <Output label="Annual Line Capacity Utilization" value={percent(result.utilization, 1)} />}
                {pricingProgram === "annual" && <Output label="Average Cases / SKU / Week" value={whole(result.casesPerSkuPerWeek)} />}
                <Output label="Weekly Output Assumption" value={`${whole(result.maxWeeklyCases)} cases`} />
              </div>
            </Panel>

            <Panel title="Pricing Program Breakdown">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Output label="Pricing Program" value={programPricing.programName} />
                <Output label={programPricing.volumeLabel} value={programPricing.volumeValue} />
                {pricingProgram !== "annual" && <Output label="Equivalent Cases" value={`${calculatedEquivalentCases} cases`} />}
                {pricingProgram === "flex" && <Output label="Minimum Day Revenue Target" value={money(programPricing.minimumRevenue, 2)} />}
                {pricingProgram === "flex" && <Output label="Entered Tolling Revenue" value={money(programPricing.baseRevenue, 2)} />}
                {pricingProgram === "flex" && <Output label="Revenue Shortfall" value={money(programPricing.dayRecoveryFee, 2)} />}
                {pricingProgram === "flex" && <Output label="Recommended Recovery $ / Can" value={`${money(programPricing.dayRecoveryPerCan, 4)} / can`} />}
                {pricingProgram === "flex" && <Output label="Flex Premium $ / Can" value={`${money(programPricing.flexPremium, 4)} / can`} />}
                {pricingProgram === "flex" && <Output label="Customer Tolling" value={`${money(programPricing.customerTolling, 4)} / can`} />}
                {pricingProgram === "flex" && <Output label="Recommended Customer Tolling" value={`${money(programPricing.recommendedFlexTolling, 4)} / can`} />}
                {pricingProgram === "flex" && <Output label="Actual Flex Tolling Revenue" value={money(programPricing.flexRevenue, 2)} />}
                {pricingProgram === "flex" && <Output label="Flex Operational Grade" value={programPricing.flexOperationalGrade} />}
                {pricingProgram === "trial" && <Output label="Daily Facility Fee" value={money(programPricing.facilityRate, 2)} />}
                {pricingProgram === "trial" && <Output label="Estimated Product Total" value={money(programPricing.productionTotal, 2)} />}
                {pricingProgram === "trial" && <Output label="Estimated Quote Total" value={money(programPricing.totalQuote, 2)} />}
                {pricingProgram === "trial" && <Output label="Minimum Day Revenue Target" value={money(programPricing.minimumRevenue, 2)} />}
                {pricingProgram === "trial" && <Output label="Required Revenue For Trial Days" value={money(programPricing.trialRequiredRevenue, 2)} />}
                {pricingProgram === "trial" && <Output label="Trial Recovery Result" value={percent(programPricing.trialRecoveryPct, 2)} />}
                {pricingProgram === "trial" && <Output label="Trial Operational Grade" value={programPricing.trialOperationalGrade} />}
              </div>
              <p className="mt-3 text-sm text-slate-600">{programPricing.note}</p>
            </Panel>

            <Panel title="Operational Review">
              <div className="rounded-xl border bg-slate-50 p-4">
                {pricingProgram === "annual" ? (
                  <>
                    <div className="font-semibold">{result.status}</div>
                    <p className="mt-1 text-sm text-slate-600">{result.statusNote}</p>
                  </>
                ) : pricingProgram === "flex" ? (
                  <>
                    <div className="font-semibold">{programPricing.flexOperationalGrade}</div>
                    <p className="mt-1 text-sm text-slate-600">
                      Actual Flex tolling revenue is {money(programPricing.flexRevenue, 2)} against a minimum day revenue target of {money(programPricing.minimumRevenue, 2)}.
                      {programPricing.capacityRecoveryShortfall > 0
                        ? ` The current quote is short by ${money(programPricing.capacityRecoveryShortfall, 2)}. Recommended customer tolling is ${money(programPricing.recommendedFlexTolling, 4)} per can.`
                        : " The current quote meets or exceeds the minimum day revenue target."}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="font-semibold">{programPricing.trialOperationalGrade}</div>
                    <p className="mt-1 text-sm text-slate-600">
                      Trial quote revenue is {money(programPricing.totalQuote, 2)} against required revenue of {money(programPricing.trialRequiredRevenue, 2)} for the reserved trial days.
                    </p>
                  </>
                )}
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
              <p className="mt-1 text-sm text-slate-600">Manhattan, KS production estimate</p>
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                {quoteDisplay.client && <QuoteLine label="Client" value={clientName} />}
                {quoteDisplay.package && <QuoteLine label="Package" value={canSize} />}
                {quoteDisplay.casePack && <QuoteLine label="Case Pack" value={`${result.casePack} pack`} />}
                {quoteDisplay.pricingProgram && <QuoteLine label="Pricing Program" value={programPricing.programName} />}
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2">
              {(quoteDisplay.volume || quoteDisplay.productionPeriod || quoteDisplay.equivalentCases || quoteDisplay.casesPerWeek || quoteDisplay.lineWeeksNeeded) && (
                <div>
                  <h4 className="mb-3 border-b pb-2 text-lg font-semibold">Volume Assumptions</h4>
                  {quoteDisplay.volume && <QuoteLine label={programPricing.volumeLabel} value={programPricing.volumeValue} />}
                  {quoteDisplay.productionPeriod && <QuoteLine label={programPricing.periodLabel} value={programPricing.periodValue} />}
                  {quoteDisplay.equivalentCases && pricingProgram !== "annual" && <QuoteLine label="Equivalent Cases" value={`${calculatedEquivalentCases} cases`} />}
                  {quoteDisplay.casesPerWeek && <QuoteLine label="Cases / Production Week" value={whole(result.weeklyCases)} />}
                  {quoteDisplay.lineWeeksNeeded && <QuoteLine label="Line Weeks / Run" value={result.lineWeeksNeeded.toFixed(2)} />}
                </div>
              )}
              {(quoteDisplay.facilityFee || quoteDisplay.tolling || quoteDisplay.materials || quoteDisplay.services || quoteDisplay.pricePerCan || quoteDisplay.pricePerCase || quoteDisplay.productTotal || quoteDisplay.quoteTotal) && (
                <div>
                  <h4 className="mb-3 border-b pb-2 text-lg font-semibold">Pricing Estimate</h4>
                  {quoteDisplay.facilityFee && pricingProgram === "trial" && <QuoteLine label="Daily Facility Fee" value={money(programPricing.facilityRate, 2)} />}
                  {quoteDisplay.tolling && <QuoteLine label={pricingProgram === "flex" ? "Customer Tolling" : "Tolling"} value={`${money(programPricing.customerTolling, 4)} / can`} />}
                  {quoteDisplay.materials && (
                    <>
                      {materialQuoteLines.map(([, label, cost]) => (
                        <QuoteLine key={label} label={label} value={`${money(cost, 4)} / can`} />
                      ))}
                      <QuoteLine label="Materials Subtotal" value={`${money(result.materialsPerCan, 4)} / can`} strong />
                    </>
                  )}
                  {quoteDisplay.services && <QuoteLine label="Additional Services" value={`${money(result.servicesPerCan, 4)} / can`} />}
                  {quoteDisplay.pricePerCan && <QuoteLine label="Estimated Total" value={`${money(programPricing.pricePerCan, 4)} / can`} strong />}
                  {quoteDisplay.pricePerCase && <QuoteLine label="Estimated Total" value={`${money(programPricing.pricePerCase, 2)} / case`} strong />}
                  {quoteDisplay.productTotal && pricingProgram === "flex" && <QuoteLine label="Estimated Campaign Total" value={money(programPricing.productionTotal, 2)} strong />}
                  {quoteDisplay.productTotal && pricingProgram === "trial" && <QuoteLine label="Estimated Product Total" value={money(programPricing.productionTotal, 2)} strong />}
                  {quoteDisplay.quoteTotal && pricingProgram === "trial" && <QuoteLine label="Estimated Quote Total" value={money(programPricing.totalQuote, 2)} strong />}
                </div>
              )}
            </div>

            {quoteDisplay.materialsSection && (
              <div className="mt-8">
                <h4 className="mb-3 border-b pb-2 text-lg font-semibold">Materials and Services</h4>
                <div className="grid grid-cols-1 gap-x-10 text-sm md:grid-cols-2">
                  {quoteDisplay.cansEnds && <QuoteLine label="Cans and Ends" value={modeLabel(canEndMode)} />}
                  {quoteDisplay.trays && <QuoteLine label="Trays" value={modeLabel(trayMode)} />}
                  {quoteDisplay.caseLabels && <QuoteLine label="Case Labels" value={modeLabel(caseLabelMode)} />}
                  {quoteDisplay.palletMaterials && <QuoteLine label="Pallet Materials" value={modeLabel(palletMode)} />}
                  {quoteDisplay.sleeveApplication && <QuoteLine label="Sleeve Application" value={modeLabel(sleeveMode)} />}
                  {quoteDisplay.cartonApplication && <QuoteLine label="Carton Application" value={modeLabel(cartonMode)} />}
                </div>
              </div>
            )}

            {(quoteDisplay.standardTerms || quoteDisplay.commercializationTerm || quoteDisplay.customTerms || quoteDisplay.warehousing || quoteDisplay.signatures) && (
              <div className="mt-8 border-t pt-5 text-xs leading-6 text-slate-600">
                {quoteDisplay.standardTerms && (<>
                  <p>*This quote is based on the production scope, packaging configuration, and assumptions outlined above. Final pricing is subject to confirmation of product specifications, packaging requirements, production schedule, and executed commercial agreement.</p>
                  <p>*Acceptance of this quotation constitutes the client's obligation to issue a production purchase order (PO) for each authorized production run.</p>
                  <p>*Bev-Hub has not produced this product previously and pricing is based on the information provided during the quoting process.</p>
                  <p>*Bev-Hub will manufacture strictly to the client-approved formulation and specifications. Bev-Hub assumes no responsibility for formulation performance, stability, or market outcomes, provided production is completed without human error or equipment malfunction.</p>
                </>)}
                {quoteDisplay.commercializationTerm && <p>*Standard commercialization through Process Authority is estimated at $3,000 per SKU.</p>}
                {quoteDisplay.customTerms && customTermLines.length > 0 && (
                  <div className="mt-5 border-t pt-4"><div className="space-y-2 text-sm text-slate-700">{customTermLines.map((line, index) => <div key={index}>*{line}</div>)}</div></div>
                )}
                {quoteDisplay.warehousing && (
                  <div className="mt-5 border-t pt-4"><div className="font-semibold">Warehousing</div><div>Pallets In: $15 / pallet raw goods</div><div>Cold Storage: $20 / pallet</div><div>Pallets Out: $8 / pallet finished goods</div><div>Pallet Storage: $15 / pallet per month</div></div>
                )}
                {quoteDisplay.signatures && <div className="mt-8 grid grid-cols-2 gap-12 text-sm text-slate-800"><Signature title="Client" showPo /><Signature title="Bev-Hub" /></div>}
              </div>
            )}
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

function TextInput({ label, value, onChange, type = "text", step, readOnly = false }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        className={`w-full rounded-xl border px-3 py-2 text-sm ${readOnly ? "bg-slate-100 text-slate-600" : ""}`}
        type={type}
        step={step}
        value={value}
        readOnly={readOnly}
        onChange={(event) => {
          if (!readOnly) onChange(event.target.value);
        }}
      />
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
      labels={{ additional: "Additional cost", included: "Included", clientSupplied: "Client supplied", notNeeded: "Not needed" }}
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


function QuoteToggle({ label, checked, onChange, disabled = false }) {
  return (
    <label className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:bg-slate-50"}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300"
      />
      <span>{label}</span>
    </label>
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

// Bev-Hub Contract Exhibits - staged integration
// Contract files are hosted at /contracts/ and share the existing origin.
export default function App() {
  const [workArea, setWorkArea] = React.useState("pricing");
  return (
    <div>
      <nav style={{display:"flex",gap:12,alignItems:"center",padding:"12px 24px",background:"#1b2941",color:"white",fontFamily:"Arial,sans-serif"}}>
        <strong style={{marginRight:16}}>BEV-HUB</strong>
        <button onClick={()=>setWorkArea("pricing")} aria-pressed={workArea==="pricing"} style={{padding:"8px 12px",borderRadius:5,fontWeight:600,color:"#1b2941",background:workArea==="pricing"?"#dceafd":"#fff"}}>Tolling Calculator</button>
        <button onClick={()=>setWorkArea("contracts")} aria-pressed={workArea==="contracts"} style={{padding:"8px 12px",borderRadius:5,fontWeight:600,color:"#1b2941",background:workArea==="contracts"?"#dceafd":"#fff"}}>Contract Exhibits A–D</button>
      </nav>
      <div style={{display:workArea==="pricing"?"block":"none"}}><BevHubPricingApp /></div>
      {workArea==="contracts" && <iframe title="Bev-Hub Contract Exhibit Generator" src="/contracts/index.html" style={{display:"block",height:"calc(100vh - 66px)",width:"100%",border:"none"}} />}
    </div>
  );
}
