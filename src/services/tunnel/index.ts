import { startTunnel } from 'untun';
import ngrok from '@ngrok/ngrok';
import { getSetting } from '../../db/index.js';

export interface TunnelStatus {
  active: boolean;
  type: 'cloudflared' | 'ngrok' | null;
  url: string | null;
  error?: string | null;
}

export class TunnelService {
  private activeTunnel: any = null;
  private tunnelType: 'cloudflared' | 'ngrok' | null = null;
  private publicUrl: string | null = null;
  private lastError: string | null = null;

  public getStatus(): TunnelStatus {
    return {
      active: !!this.publicUrl,
      type: this.tunnelType,
      url: this.publicUrl,
      error: this.lastError,
    };
  }

  public async start(type: 'cloudflared' | 'ngrok', authtoken?: string, port = 3001): Promise<TunnelStatus> {
    // If already running, stop previous tunnel first
    await this.stop();

    this.lastError = null;
    this.tunnelType = type;

    try {
      if (type === 'cloudflared') {
        console.log('[Tunnel] Memulai Cloudflare Quick Tunnel (Gratis, tanpa akun)...');
        const tunnel = await startTunnel({
          port,
          acceptCloudflareNotice: true,
        });

        if (tunnel) {
          const url = await tunnel.getURL();
          this.activeTunnel = tunnel;
          this.publicUrl = url;
          console.log(`[Tunnel] Cloudflare Tunnel aktif: ${url}`);
        }
      } else if (type === 'ngrok') {
        const token = authtoken || getSetting('ngrok_authtoken', '');
        if (!token) {
          throw new Error('Ngrok Authtoken belum diisi di Settings.');
        }

        console.log('[Tunnel] Memulai Ngrok Tunnel...');
        const listener = await ngrok.forward({
          addr: port,
          authtoken: token,
        });

        this.activeTunnel = listener;
        this.publicUrl = listener.url() || null;
        console.log(`[Tunnel] Ngrok Tunnel aktif: ${this.publicUrl}`);
      }

      return this.getStatus();
    } catch (err: any) {
      console.error('[Tunnel Error]', err);
      this.lastError = err.message;
      this.publicUrl = null;
      this.activeTunnel = null;
      return this.getStatus();
    }
  }

  public async stop(): Promise<TunnelStatus> {
    try {
      if (this.activeTunnel) {
        if (this.tunnelType === 'cloudflared') {
          if (typeof this.activeTunnel.close === 'function') {
            await this.activeTunnel.close();
          }
        } else if (this.tunnelType === 'ngrok') {
          if (typeof this.activeTunnel.close === 'function') {
            await this.activeTunnel.close();
          }
          await ngrok.disconnect();
        }
      }
    } catch (err) {
      console.warn('Error while stopping tunnel:', err);
    } finally {
      this.activeTunnel = null;
      this.publicUrl = null;
      this.tunnelType = null;
      this.lastError = null;
    }

    return this.getStatus();
  }
}

export const tunnelService = new TunnelService();
