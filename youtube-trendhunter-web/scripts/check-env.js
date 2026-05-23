// Vérifier les variables d'environnement
require("dotenv").config({ path: ".env.local" });

console.log("Variables d'environnement:");
console.log("NEXT_PUBLIC_SUPABASE_URL:", process.env.NEXT_PUBLIC_SUPABASE_URL ? "OK" : "MANQUANTE");
console.log(
  "SUPABASE_SERVICE_ROLE_KEY:",
  process.env.SUPABASE_SERVICE_ROLE_KEY ? "OK" : "MANQUANTE",
);

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.log("\nLa variable NEXT_PUBLIC_SUPABASE_URL est manquante dans .env.local");
  console.log("Veuillez ajouter cette variable dans votre fichier .env.local");
}
