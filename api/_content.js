// Shared content + helpers used by render.js and sitemap.js:
// company-slug derivation and the glossary entries.

function slugify(s) {
  return String(s || "").toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

// Group breaches under a company. Domain root gives the cleanest, most
// keyword-friendly key (sysco.com -> "sysco"); fall back to the title.
function companySlug(it) {
  return slugify(it.domain ? it.domain.split(".")[0] : it.title);
}

const GLOSSARY = [
  { slug: "data-breach", term: "Data breach", short: "Unauthorized access to or release of private data.", body: "A data breach is any incident where information is accessed, copied, or released without authorization. Breaches range from a misconfigured database left open on the internet to an attacker stealing a company's customer records. The exposed data can include email addresses, passwords, payment details, or government identifiers." },
  { slug: "credential-stuffing", term: "Credential stuffing", short: "Reusing leaked username and password pairs to break into other accounts.", body: "Credential stuffing is an attack where username and password pairs stolen in one breach are tried automatically against many other sites. It works because people reuse the same password across services. A unique password for every site, stored in a password manager, defeats it." },
  { slug: "phishing", term: "Phishing", short: "Fake messages that trick you into giving up information.", body: "Phishing is a message, usually email or text, that impersonates a trusted company to trick you into entering passwords, payment details, or other information. Breaches fuel phishing because attackers learn which services you use and can reference real details to seem convincing." },
  { slug: "ransomware", term: "Ransomware", short: "Malware that encrypts data and demands payment.", body: "Ransomware is malicious software that locks or encrypts an organization's files and demands payment to restore them. Modern ransomware groups also steal the data first and threaten to publish it, which is how many breaches become public." },
  { slug: "two-factor-authentication", term: "Two-factor authentication (2FA)", short: "A second login step beyond your password.", body: "Two-factor authentication adds a second proof of identity beyond your password, such as a code from an app or a hardware key. Even if a breach exposes your password, 2FA can stop an attacker from logging in. App-based or hardware 2FA is stronger than text-message codes." },
  { slug: "credit-freeze", term: "Credit freeze", short: "Blocking new credit accounts from being opened in your name.", body: "A credit freeze restricts access to your credit report, which prevents most lenders from opening new accounts in your name. It is a strong protection after a breach that exposes Social Security numbers or other identity data, and it is free to place and lift with each credit bureau." },
  { slug: "dark-web", term: "Dark web", short: "Hidden parts of the internet where stolen data is often traded.", body: "The dark web is a portion of the internet that requires special software to reach and is not indexed by search engines. Data stolen in breaches is frequently sold or traded there, which is why breach-monitoring services exist." },
  { slug: "password-manager", term: "Password manager", short: "An app that creates and stores a unique password for every site.", body: "A password manager generates and stores a strong, unique password for each site, so a breach at one service does not put your other accounts at risk. You only need to remember one master password. It is the single most effective habit for limiting breach damage." },
];

module.exports = { slugify, companySlug, GLOSSARY };
