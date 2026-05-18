-- Création du schéma pour YoutubeTrendHunter
CREATE SCHEMA IF NOT EXISTS YoutubeTrendHunter;

-- Attribution de tous les droits au user dev
GRANT ALL PRIVILEGES ON SCHEMA YoutubeTrendHunter TO dev;

-- Par défaut, toutes les nouvelles tables créées dans ce schéma auront les mêmes droits
ALTER DEFAULT PRIVILEGES IN SCHEMA YoutubeTrendHunter GRANT ALL ON TABLES TO dev;
ALTER DEFAULT PRIVILEGES IN SCHEMA YoutubeTrendHunter GRANT ALL ON SEQUENCES TO dev;