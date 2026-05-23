import type { Metadata } from "next";
import Link from "next/link";
import { PLANS } from "@/lib/plans";
import { Check, Play, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Tarifs - TrendHunter",
  description:
    "Choisissez le plan TrendHunter qui correspond à vos besoins. Free, Pro ou Team. Accès aux tendances YouTube IA.",
  openGraph: {
    title: "Tarifs TrendHunter - Choisissez votre plan",
    description: "Accédez aux tendances YouTube en temps réel avec l'IA. Plans starting at 0€.",
    url: "/pricing",
    type: "website",
  },
  alternates: {
    canonical: "/pricing",
  },
};

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-dark-canvas text-dark-ink py-20 px-4 relative overflow-hidden font-roboto">
      {/* Background Orbs - static, no animation */}
      <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-yt-red/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] bg-yt-link/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-[1400px] mx-auto relative z-10">
        <div className="text-center mb-20 space-y-4">
          <Link href="/" className="inline-flex items-center gap-2 mb-4 group">
            <div className="bg-yt-red p-1.5 rounded-lg group-hover:scale-110 transition-transform">
              <Play className="w-4 h-4 text-white fill-current" />
            </div>
            <span className="text-xl font-bold tracking-tighter">TrendHunter</span>
          </Link>
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter italic">
            Investissez dans <br className="sm:hidden" />{" "}
            <span className="text-yt-red">votre succès.</span>
          </h1>
          <p className="text-lg md:text-xl text-dark-ink-secondary max-w-2xl mx-auto font-medium leading-relaxed">
            Des outils puissants pour transformer votre chaîne en machine à vues. Choisissez le plan
            qui propulsera votre carrière.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto items-center">
          {PLANS.map((plan) => (
            <Card
              key={plan.name}
              className={`relative transition-all duration-300 rounded-[2.5rem] border-hairline-dark bg-dark-surface/40 backdrop-blur-sm ${
                plan.popular
                  ? "border-yt-red/50 shadow-[0_0_40px_rgba(255,0,0,0.1)] scale-105 md:scale-110 z-20"
                  : "hover:border-white/20 z-10"
              }`}
            >
              <CardHeader className="p-8">
                {plan.popular && (
                  <Badge
                    variant="live"
                    className="w-fit mb-4 animate-pulse-glow font-black tracking-widest px-4"
                  >
                    <Sparkles className="w-3 h-3 mr-1" /> POPULAIRE
                  </Badge>
                )}
                <CardTitle className="text-3xl font-black italic">{plan.name}</CardTitle>
                <CardDescription className="pt-2">
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-black text-dark-ink">{plan.price}</span>
                    <span className="text-dark-ink-secondary font-bold text-lg">{plan.period}</span>
                  </div>
                  <p className="mt-4 text-dark-ink-secondary font-medium">{plan.description}</p>
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8 pt-0">
                <Separator className="mb-8 opacity-20" />
                <ul className="space-y-4 mb-10">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-4 text-sm font-medium">
                      <div className="w-5 h-5 rounded-full bg-yt-red/10 flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3 text-yt-red" />
                      </div>
                      <span className="text-dark-ink-secondary">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link href={plan.href} className="block group">
                  <Button
                    className={`w-full h-14 rounded-2xl text-base font-black shadow-lg transition-all group-hover:scale-105 ${plan.popular ? "" : "border-hairline-dark"}`}
                    variant={plan.popular ? "subscribe" : "outline"}
                  >
                    {plan.cta}
                    <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-24 text-center">
          <p className="text-dark-ink-tertiary text-sm font-bold uppercase tracking-[0.2em]">
            Paiement sécurisé par Stripe • Sans engagement
          </p>
        </div>
      </div>
    </div>
  );
}
