import {
  Component, inject, signal, Input, Output, EventEmitter, OnDestroy, AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../../services/auth.service';
import { EventService } from '../../../services/event.service';

// Stripe.js se carga dinámicamente
declare const Stripe: any;

const API        = 'http://localhost:8080';
const STRIPE_PK  = 'pk_test_51TR7K9JUYvjfABrOihbe5I6FN0fX3CXMLnirSsWpgqnZV16RK5tloClbWfsE1raWkKZ8b3SpGaeKfjM1Tq2BhdMo0015ldbcYs';

export type PaymentStep =
  | 'idle'
  | 'loading'
  | 'form'
  | 'processing'
  | 'done'
  | 'error';

@Component({
  selector: 'app-payment',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './payment.html',
  styleUrls: ['./payment.css']
})
export class PaymentComponent implements AfterViewInit, OnDestroy {

  // ── I/O ───────────────────────────────────────────────────
  @Input({ required: true }) precioCentimos!: number;
  @Input({ required: true }) tokenPrerreserva!: string;
  @Output() closed  = new EventEmitter<void>();
  @Output() success = new EventEmitter<string>();

  private http      = inject(HttpClient);
  private authSvc   = inject(AuthService);
  private eventSvc  = inject(EventService);

  // ── State ─────────────────────────────────────────────────
  step         = signal<PaymentStep>('idle');
  errorMsg     = signal<string | null>(null);
  successMsg   = signal<string | null>(null);

  // Formateo del precio para la interfaz minimalista
  get euros(): number { return Math.floor(this.precioCentimos / 100); }
  get cents(): string { return (this.precioCentimos % 100).toString().padStart(2, '0'); }

  // ── Stripe internals ──────────────────────────────────────
  private stripe:            any = null;
  private elements:          any = null;
  private cardNumberElement: any = null;
  private cardExpiryElement: any = null;
  private cardCvcElement:    any = null;
  private clientSecret:      string = '';
  private payerEmail:        string = '';

  // ── Lifecycle ─────────────────────────────────────────────
  ngAfterViewInit(): void {
    this._loadStripeAndInit();
  }

  ngOnDestroy(): void {
    if (this.cardNumberElement) { try { this.cardNumberElement.destroy(); } catch (_) {} }
    if (this.cardExpiryElement) { try { this.cardExpiryElement.destroy(); } catch (_) {} }
    if (this.cardCvcElement)    { try { this.cardCvcElement.destroy(); } catch (_) {} }
  }

  // ── 1. Carga Stripe.js dinámicamente ─────────────────────
  private _loadStripeAndInit(): void {
    this.step.set('loading');

    if (typeof Stripe !== 'undefined') {
      this._createPaymentIntent();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.onload = () => this._createPaymentIntent();
    script.onerror = () => {
      this.step.set('error');
      this.errorMsg.set('No se pudo cargar el módulo de pago. Comprueba tu conexión.');
    };
    document.head.appendChild(script);
  }

  // ── 2. Crea el PaymentIntent en el backend ────────────────
  private _createPaymentIntent(): void {
    const tokenUsuario = this.authSvc.getToken();
    if (!tokenUsuario) {
      this.step.set('error');
      this.errorMsg.set('Sesión expirada. Vuelve a iniciar sesión.');
      return;
    }

    this.http.post<{ clientSecret: string; email: string }>(
      `${API}/compras/prepay`,
      {
        precio:          this.precioCentimos,
        tokenPrerreserva: this.tokenPrerreserva,
        tokenUsuario
      }
    ).subscribe({
      next: res => {
        this.clientSecret = res.clientSecret;
        this.payerEmail   = res.email;
        this._mountCardElements();
      },
      error: err => {
        this.step.set('error');
        this.errorMsg.set(
          err.status === 401
            ? 'Sesión expirada. Vuelve a iniciar sesión.'
            : 'Error al inicializar el pago. Inténtalo de nuevo.'
        );
      }
    });
  }

  // ── 3. Monta los elementos de tarjeta de Stripe ───────────
  private _mountCardElements(): void {
    this.stripe   = Stripe(STRIPE_PK);
    this.elements = this.stripe.elements();

    const style = {
      base: {
        color:                '#ffffff',
        fontFamily:           'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize:             '18px',
        fontSmoothing:        'antialiased',
        letterSpacing:        '0.08em',
        '::placeholder':      { color: 'rgba(255,255,255,0.2)' },
        iconColor:            'rgba(255,255,255,0.4)',
      },
      invalid: {
        color:     '#ff6b6b',
        iconColor: '#ff6b6b',
      },
    };

    // Al estar separados, creamos los 3 campos de forma independiente
    this.cardNumberElement = this.elements.create('cardNumber', { style, showIcon: true });
    this.cardExpiryElement = this.elements.create('cardExpiry', { style });
    this.cardCvcElement    = this.elements.create('cardCvc', { style });

    this.step.set('form');
    
    setTimeout(() => {
      const mountNumber = document.getElementById('stripe-card-number');
      const mountExpiry = document.getElementById('stripe-card-expiry');
      const mountCvc    = document.getElementById('stripe-card-cvc');

      if (mountNumber && mountExpiry && mountCvc) {
        this.cardNumberElement.mount(mountNumber);
        this.cardExpiryElement.mount(mountExpiry);
        this.cardCvcElement.mount(mountCvc);

        const handleChange = (event: any) => {
          this.errorMsg.set(event.error?.message ?? null);
        };

        this.cardNumberElement.on('change', handleChange);
        this.cardExpiryElement.on('change', handleChange);
        this.cardCvcElement.on('change', handleChange);
      } else {
        this.step.set('error');
        this.errorMsg.set('Error al cargar el formulario de pago.');
      }
    }, 50);
  }

  // ── 4. El usuario pulsa "Pagar" ───────────────────────────
  async submitPayment(): Promise<void> {
    if (!this.stripe || !this.cardNumberElement || this.step() === 'processing') return;

    this.step.set('processing');
    this.errorMsg.set(null);

    try {
      const { error, paymentIntent } = await this.stripe.confirmCardPayment(
        this.clientSecret,
        {
          payment_method: {
            // Stripe extrae automáticamente Fecha y CVC al enviar cardNumber
            card: this.cardNumberElement,
            billing_details: { email: this.payerEmail }
          }
        }
      );

      if (error) {
        this.step.set('form');
        this.errorMsg.set(this._translateStripeError(error));
        return;
      }

      if (paymentIntent?.status === 'succeeded') {
        this._confirmWithBackend(paymentIntent.id);
      } else {
        this.step.set('form');
        this.errorMsg.set('El pago no se completó. Inténtalo de nuevo.');
      }

    } catch (e) {
      this.step.set('form');
      this.errorMsg.set('Error inesperado. Inténtalo de nuevo.');
    }
  }

  // ── 5. Confirma la compra en el backend ───────────────────
  private _confirmWithBackend(paymentIntentId: string): void {
    this.http.post<string>(
      `${API}/compras/confirm`,
      {
        paymentIntentId,
        tokenPrerreserva: this.tokenPrerreserva,
        email:            this.payerEmail
      },
      { responseType: 'text' as 'json' }
    ).subscribe({
      next: msg => {
        this.step.set('done');
        this.successMsg.set(msg ?? '¡Compra realizada con éxito!');
        this.eventSvc.clearCart();
        this.success.emit(msg ?? '¡Compra realizada con éxito!');
      },
      error: () => {
        this.step.set('error');
        this.errorMsg.set(
          'El pago fue procesado pero ocurrió un error al registrar las entradas. ' +
          'Contacta con soporte indicando tu correo y el espectáculo.'
        );
      }
    });
  }

  // ── Traducción de errores de Stripe ──────────────────────
  private _translateStripeError(error: any): string {
    switch (error.code) {
      case 'card_declined':           return 'Tarjeta rechazada. Comprueba los datos o usa otra tarjeta.';
      case 'insufficient_funds':      return 'Fondos insuficientes.';
      case 'expired_card':            return 'La tarjeta ha caducado.';
      case 'incorrect_cvc':           return 'El código de seguridad (CVC) es incorrecto.';
      case 'incorrect_number':        return 'El número de tarjeta no es válido.';
      case 'processing_error':        return 'Error al procesar el pago. Inténtalo de nuevo.';
      case 'authentication_required': return 'Tu banco requiere autenticación adicional (3D Secure).';
      default:                        return error.message ?? 'Error al procesar el pago.';
    }
  }

  close(): void { this.closed.emit(); }
}