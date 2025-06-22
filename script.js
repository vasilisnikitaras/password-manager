let cryptoKey;
let unlocked = false;
let activeUser = null;
let isRegisterMode = false;

// Παράγει κλειδί από password
const deriveKeyFromPassword = async (password) => {
  const encoder = new TextEncoder();
  const salt = new Uint8Array([11,22,33,44,55,66,77,88]);
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]);
  return await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

// Εναλλαγή μεταξύ login/register mode
const toggleAuthMode = () => {
  isRegisterMode = !isRegisterMode;
  document.getElementById("formTitle").textContent = isRegisterMode ? "Εγγραφή" : "Σύνδεση";
  document.getElementById("loginBtn").style.display = isRegisterMode ? "none" : "inline-block";
  document.getElementById("registerBtn").style.display = isRegisterMode ? "inline-block" : "none";
  document.getElementById("authError").textContent = "";
  document.getElementById("toggleAuth").textContent = isRegisterMode
    ? "Έχεις ήδη λογαριασμό; Σύνδεση εδώ"
    : "Δεν έχεις λογαριασμό; Εγγράψου εδώ";
};

// Εγγραφή νέου χρήστη
const submitRegister = async () => {
  const username = document.getElementById("authUsername").value.trim().toLowerCase();
  const password = document.getElementById("authPassword").value;
  const error = document.getElementById("authError");

  if (!username || !password) {
    error.textContent = "Συμπλήρωσε όλα τα πεδία!";
    return;
  }

  if (localStorage.getItem(`vault_${username}`)) {
    error.textContent = "Το username υπάρχει ήδη!";
    return;
  }

  cryptoKey = await deriveKeyFromPassword(password);
  localStorage.setItem(`vault_${username}`, "[]");
  activeUser = username;
  unlocked = true;
  document.getElementById("authSection").style.display = "none";
  document.getElementById("managerSection").style.display = "block";
  await displayPasswords();
};

// Σύνδεση χρήστη
const submitLogin = async () => {
  const username = document.getElementById("authUsername").value.trim().toLowerCase();
  const password = document.getElementById("authPassword").value;
  const error = document.getElementById("authError");

  if (!username || !password) {
    error.textContent = "Συμπλήρωσε όλα τα πεδία!";
    return;
  }

  if (!localStorage.getItem(`vault_${username}`)) {
    error.textContent = "Ο χρήστης δεν υπάρχει!";
    return;
  }

  cryptoKey = await deriveKeyFromPassword(password);
  activeUser = username;
  unlocked = true;

  document.getElementById("authSection").style.display = "none";
  document.getElementById("managerSection").style.display = "block";
  await displayPasswords();
};

// Theme Toggle
const toggleTheme = () => {
  const body = document.body;
  const next = body.classList.contains("dark-mode") ? "light-mode" : "dark-mode";
  body.classList.remove("light-mode", "dark-mode");
  body.classList.add(next);
  localStorage.setItem("theme", next);
};

// Eye toggle 👁️
const togglePasswordVisibility = (inputId, icon) => {
  const input = document.getElementById(inputId);
  const isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  icon.textContent = isHidden ? "🙈" : "👁️";
};

// Αποθήκευση νέου κωδικού
const savePassword = async () => {
  if (!unlocked || !activeUser) return;

  const site = document.getElementById("site").value;
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  if (!site || !username || !password) return;

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(password);
  const buffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, encoded);
  const encrypted = {
    cipher: Array.from(new Uint8Array(buffer)),
    iv: Array.from(iv),
  };

  const entry = { site, username, encrypted };
  const entries = JSON.parse(localStorage.getItem(`vault_${activeUser}`) || "[]");
  entries.push(entry);
  localStorage.setItem(`vault_${activeUser}`, JSON.stringify(entries));

  document.getElementById("site").value = "";
  document.getElementById("username").value = "";
  document.getElementById("password").value = "";

  await displayPasswords();
};
// Αποκρυπτογράφηση κωδικού
const decryptPassword = async ({ cipher, iv }) => {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    cryptoKey,
    new Uint8Array(cipher)
  );
  return new TextDecoder().decode(decrypted);
};

// Εμφάνιση αποθηκευμένων κωδικών
const displayPasswords = async () => {
  const list = document.getElementById("passwordList");
  list.innerHTML = "";
  const entries = JSON.parse(localStorage.getItem(`vault_${activeUser}`) || "[]");

  for (const entry of entries) {
    try {
      const password = await decryptPassword(entry.encrypted);
      const li = document.createElement("li");
      li.textContent = `${entry.site}: ${entry.username} / ${password}`;
      list.appendChild(li);
    } catch {
      const li = document.createElement("li");
      li.textContent = `${entry.site}: ${entry.username} / 🔒 Κρυπτογραφημένο`;
      list.appendChild(li);
    }
  }
};

// Εξαγωγή Vault ως .txt αρχείο
const exportPasswords = async () => {
  if (!unlocked || !activeUser) return;
  const entries = JSON.parse(localStorage.getItem(`vault_${activeUser}`) || "[]");
  let content = `Password Vault για ${activeUser}\n\n`;

  for (const [i, entry] of entries.entries()) {
    try {
      const pwd = await decryptPassword(entry.encrypted);
      content += `${i + 1}. ${entry.site} - ${entry.username} / ${pwd}\n`;
    } catch {
      content += `${i + 1}. ${entry.site} - ${entry.username} / (locked)\n`;
    }
  }

  const blob = new Blob([content], { type: "text/plain" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${activeUser}_vault.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
};

// Αλλαγή Master Password
const changeMasterPassword = async () => {
  const oldPass = document.getElementById("oldMaster").value;
  const newPass = document.getElementById("newMaster").value;
  const error = document.getElementById("changeError");

  try {
    const oldKey = await deriveKeyFromPassword(oldPass);
    const entries = JSON.parse(localStorage.getItem(`vault_${activeUser}`) || "[]");

    // Επιβεβαίωση ότι το παλιό password είναι σωστό
    for (const entry of entries) {
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(entry.encrypted.iv) },
        oldKey,
        new Uint8Array(entry.encrypted.cipher)
      );
    }

    // Επανακρυπτογράφηση με το νέο password
    const newKey = await deriveKeyFromPassword(newPass);
    const reEncrypted = [];

    for (const entry of entries) {
      const decrypted = await decryptPassword(entry.encrypted);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(decrypted);
      const buffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, newKey, encoded);
      const encrypted = { cipher: Array.from(new Uint8Array(buffer)), iv: Array.from(iv) };
      reEncrypted.push({ site: entry.site, username: entry.username, encrypted });
    }

    localStorage.setItem(`vault_${activeUser}`, JSON.stringify(reEncrypted));
    cryptoKey = newKey;
    await displayPasswords();

    document.getElementById("oldMaster").value = "";
    document.getElementById("newMaster").value = "";
    error.textContent = "Ο κωδικός άλλαξε επιτυχώς ✅";
    error.style.color = "green";
  } catch {
    error.textContent = "Μη έγκυρος τρέχων κωδικός!";
    error.style.color = "red";
  }
};

// Αποσύνδεση χρήστη
const logout = () => {
  cryptoKey = null;
  unlocked = false;
  activeUser = null;

  document.getElementById("managerSection").style.display = "none";
  document.getElementById("authSection").style.display = "block";
  document.getElementById("authUsername").value = "";
  document.getElementById("authPassword").value = "";
  document.getElementById("authError").textContent = "";
};

// Φόρτωση αποθηκευμένου θέματος κατά την εκκίνηση
window.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("theme") || "light-mode";
  document.body.classList.add(savedTheme);
});
