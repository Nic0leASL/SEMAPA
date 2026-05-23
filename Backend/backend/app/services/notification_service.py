import logging

logger = logging.getLogger("NotificationService")

class NotificationService:
    @staticmethod
    def generate_templates(payload: dict) -> dict:
        """
        Generates notifications templates.
        Payload keys: 'titular', 'contrato', 'consumo', 'deuda', 'url_pdf'
        """
        titular = payload.get("titular", "Estimado Cliente")
        contrato = payload.get("contrato", "N/A")
        consumo = payload.get("consumo", 0)
        deuda = payload.get("deuda", 0.0)
        url_pdf = payload.get("url_pdf", "#")

        # 1. Email template (HTML)
        email_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 20px; }}
                .container {{ max-width: 600px; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05); margin: 0 auto; border: 1px solid #e1e8ed; }}
                .header {{ background-color: #0f294a; color: white; padding: 30px; text-align: center; }}
                .header h1 {{ margin: 0; font-size: 24px; }}
                .content {{ padding: 30px; color: #333333; line-height: 1.6; }}
                .content h2 {{ color: #0d7e8a; margin-top: 0; }}
                .invoice-box {{ background-color: #f7f9fb; border-left: 4px solid #0d7e8a; padding: 15px; margin: 20px 0; border-radius: 0 4px 4px 0; }}
                .invoice-box p {{ margin: 5px 0; font-size: 14px; }}
                .button {{ display: inline-block; background-color: #0d7e8a; color: white; padding: 12px 25px; text-decoration: none; border-radius: 4px; font-weight: bold; margin-top: 15px; }}
                .footer {{ background-color: #f4f6f8; text-align: center; padding: 20px; font-size: 12px; color: #777777; border-top: 1px solid #e1e8ed; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>SEMAPA Cochabamba</h1>
                </div>
                <div class="content">
                    <h2>Preaviso de Cobranza Digital</h2>
                    <p>Hola, <strong>{titular}</strong>,</p>
                    <p>Le notificamos que el preaviso correspondiente a su consumo de agua potable ya se encuentra disponible para su consulta.</p>
                    
                    <div class="invoice-box">
                        <p><strong>Nro. Contrato:</strong> {contrato}</p>
                        <p><strong>Consumo del Periodo:</strong> {consumo} m³</p>
                        <p><strong>Monto Exigible:</strong> Bs. {deuda:.2f}</p>
                    </div>
                    
                    <p>Puede descargar su preaviso de facturación detallado en formato PDF haciendo clic en el siguiente enlace:</p>
                    <p style="text-align: center;">
                        <a href="{url_pdf}" class="button" target="_blank">Descargar Preaviso PDF</a>
                    </p>
                    
                    <p>Evite cortes de servicio realizando su pago oportunamente en agencias autorizadas.</p>
                </div>
                <div class="footer">
                    <p>Este correo electrónico fue generado automáticamente por la Plataforma SEMAPA Big Data.<br/>
                    © 2026 SEMAPA Cochabamba - Todos los derechos reservados.</p>
                </div>
            </div>
        </body>
        </html>
        """

        # 2. WhatsApp template (Rich-text markdown)
        whatsapp_text = (
            f"💧 *SEMAPA Cochabamba - Preaviso de Cobranza* 💧\n\n"
            f"Estimado(a) *{titular}*,\n"
            f"Le informamos que el detalle de consumo para su contrato *{contrato}* está listo:\n\n"
            f"🔹 *Consumo:* {consumo} m³\n"
            f"🔹 *Monto a Pagar:* Bs. {deuda:.2f}\n\n"
            f"📱 Descargue su preaviso en formato digital (PDF) aquí:\n"
            f"{url_pdf}\n\n"
            f"💡 *Evite multas y cortes.* Pague su factura en sucursales autorizadas o banca móvil."
        )

        # 3. SMS template (Short Text)
        sms_text = (
            f"SEMAPA Preaviso: Contrato {contrato}. Consumo {consumo}m3. Deuda: Bs.{deuda:.2f}. "
            f"Descargue su factura PDF aqui: {url_pdf}. Evite cortes."
        )

        return {
            "email_html": email_html.strip(),
            "whatsapp_text": whatsapp_text.strip(),
            "sms_text": sms_text.strip()
        }
