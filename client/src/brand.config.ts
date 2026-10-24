/**
 * White-Label & Application Branding Configuration
 * Memudahkan kustomisasi identitas aplikasi untuk deployment komersial atau white-label.
 */
export interface BrandConfig {
  appName: string;
  appTitle: string;
  appSubtitle: string;
  version: string;
  companyName: string;
  websiteUrl: string;
  supportUrl?: string;
  docsUrl?: string;
  developerCredit?: {
    show: boolean;
    name: string;
    url: string;
  };
  footerNotice: string;
  riskDisclaimer: string;
}

export const brandConfig: BrandConfig = {
  appName: 'AI Trading',
  appTitle: 'Autonomous Crypto Trading Terminal',
  appSubtitle: 'Riset AI Otomatis • Proteksi Modal • Eksekusi Presisi',
  version: 'v1.1',
  companyName: 'AI-Trading Technologies',
  websiteUrl: 'https://github.com/0xFE1C/AI-Trading',
  docsUrl: '/docs/PANDUAN_PENGGUNA.md',
  developerCredit: {
    show: false, // Default false for clean commercial white-label
    name: 'Felix',
    url: 'https://github.com/0xFE1C',
  },
  footerNotice: 'Riset AI Otomatis, Proteksi Modal, Eksekusi Presisi.',
  riskDisclaimer: 'Perdagangan aset kripto memiliki risiko volatilitas tinggi terhadap modal. AI Trading adalah piranti lunak otomasi kuantitatif, bukan penasihat keuangan atau manajer investasi berizin.',
};
