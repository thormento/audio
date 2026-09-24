/**
 * page-creator.js - Utilidades para criação automática de páginas
 */

// Nomes para geração aleatória
const PRIMEIROS = [
  "Emma", "Olivia", "Ava", "Isabella", "Sophia", "Mia", "Charlotte", "Amelia",
  "Harper", "Evelyn", "Abigail", "Emily", "Ella", "Elizabeth", "Avery", "Scarlett",
  "Madison", "Victoria", "Chloe", "Penelope", "Eleanor", "Nora", "Hannah", "Lucy",
  "Natalie", "Zoe", "Leah", "Hailey", "Audrey", "Savannah", "Claire", "Caroline",
  "Samantha", "Anna", "Kennedy", "Ellie", "Aubrey", "Addison", "Sarah", "Katherine",
];

const SOBRENOMES = [
  "Johnson", "Williams", "Miller", "Davis", "Wilson", "Anderson", "Thomas",
  "Taylor", "Moore", "Jackson", "Martin", "Thompson", "Harris", "Robinson",
  "Walker", "Allen", "Scott", "Adams", "Nelson", "Carter", "Mitchell", "Roberts",
  "Turner", "Phillips", "Evans", "Edwards", "Collins", "Murphy", "Bennett",
];

const PALAVRAS_BLOQUEADAS = [];

export function randomName() {
  const first = PRIMEIROS[Math.floor(Math.random() * PRIMEIROS.length)];
  const last = SOBRENOMES[Math.floor(Math.random() * SOBRENOMES.length)];
  return `${first} ${last}`;
}

export function isBlockedName(nome) {
  const n = nome.toLowerCase();
  return PALAVRAS_BLOQUEADAS.some(p => p && n.includes(p.toLowerCase()));
}

export async function loadNamesFromFile() {
  try {
    const url = chrome.runtime.getURL("nomes.txt");
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return [];
    const txt = (await r.text()).replace(/^﻿/, "");
    return txt
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l && !l.startsWith("#"));
  } catch (e) {
    return [];
  }
}

export async function startPageCreation(quantity, useFile) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      type: 'START_PAGE_CREATION',
      quantity,
      useFile
    }, resolve);
  });
}

export async function stopPageCreation() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      type: 'STOP_PAGE_CREATION'
    }, resolve);
  });
}

export async function getPageCreationStatus() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      type: 'GET_PAGE_CREATION_STATUS'
    }, resolve);
  });
}
