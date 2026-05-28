import os
import re
import glob
import smtplib
import gspread
import markdown
import io
import asyncio
import random
from xhtml2pdf import pisa
from email.message import EmailMessage
from google.oauth2.service_account import Credentials
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes

# Load environment variables
load_dotenv()

TELEGRAM_TOKEN = os.getenv("TELEGRAM_SALES_BOT_TOKEN")
GMAIL_ADDRESS = os.getenv("GMAIL_ADDRESS")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD")
SERVICE_ACCOUNT_FILE = os.getenv("SERVICE_ACCOUNT_FILE", "service_account.json")
SPREADSHEET_NAME = os.getenv("SPREADSHEET_NAME")
WORKSHEET_NAME = os.getenv("WORKSHEET_NAME", "Sheet1")

def init_gspread():
    """Initialize gspread client."""
    scopes = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ]
    credentials = Credentials.from_service_account_file(SERVICE_ACCOUNT_FILE, scopes=scopes)
    gc = gspread.authorize(credentials)
    sheet = gc.open(SPREADSHEET_NAME)
    
    if WORKSHEET_NAME:
        try:
            return sheet.worksheet(WORKSHEET_NAME)
        except gspread.exceptions.WorksheetNotFound:
            pass
    return sheet.sheet1

def get_sent_ids():
    """Fetches the list of client IDs that have already been sent an email."""
    try:
        worksheet = init_gspread()
        records = worksheet.get_all_records()
        headers = worksheet.row_values(1)
        
        if 'Outreach Platform' not in headers:
            return []
            
        sent_ids = []
        for row in records:
            if str(row.get('Outreach Platform', '')).strip().lower() == 'email-sent':
                sent_ids.append(str(row.get('Client ID', '')))
        return sent_ids
    except Exception as e:
        print("Error fetching sent IDs:", e)
        return []

def parse_reports(exclude_ids=None):
    """Scans the reports directory and extracts outreach data."""
    if exclude_ids is None:
        exclude_ids = []
        
    reports_dir = os.path.join(os.getcwd(), 'reports')
    if not os.path.exists(reports_dir):
        return []

    parsed_leads = []
    
    for filepath in glob.glob(os.path.join(reports_dir, '*.txt')):
        filename = os.path.basename(filepath)
        client_id = filename.replace('.txt', '')
        
        if client_id in exclude_ids:
            continue
            
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # Regex patterns to extract sections
        contact_match = re.search(r'\[CONTACT_DETAILS\](.*?)\[OUTREACH_PLATFORM\]', content, re.DOTALL)
        platform_match = re.search(r'\[OUTREACH_PLATFORM\](.*?)\[FINAL_OUTREACH_MESSAGE\]', content, re.DOTALL)
        message_match = re.search(r'\[FINAL_OUTREACH_MESSAGE\](.*)', content, re.DOTALL)

        if contact_match and platform_match:
            contact_text = contact_match.group(1).strip()
            platform_text = platform_match.group(1).replace('**', '').strip()
            
            # Find ALL unique emails in the contact text
            raw_emails = re.findall(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', contact_text)
            # Remove duplicates while preserving order
            emails = list(dict.fromkeys([e.lower() for e in raw_emails]))
            target_email = emails if emails else None
            
            if target_email and ('Email' in platform_text or 'Both' in platform_text):
                email_body = ""
                
                # Extract audit text
                audit_match = re.search(r'\[AUDIT_START\](.*?)\[AUDIT_END\]', content, re.DOTALL)
                audit_text = audit_match.group(1).strip() if audit_match else ""
                
                # Check for the new strict formatting tags
                email_block_match = re.search(r'\[EMAIL_START\](.*?)\[EMAIL_END\]', content, re.DOTALL)
                if email_block_match:
                    email_body = email_block_match.group(1).strip()
                elif message_match:
                    # Fallback for old reports
                    raw_message_text = message_match.group(1).strip()
                    email_body = raw_message_text
                    whatsapp_splitters = ['**WhatsApp Text Variant**', 'WhatsApp Text Variant:', 'WhatsApp Variant:', '**WhatsApp Version**']
                    for splitter in whatsapp_splitters:
                        if splitter in email_body:
                            email_body = email_body.split(splitter)[0].strip()
                    email_body = re.sub(r'^\*\*Email Variant\*\*[\r\n]+', '', email_body, flags=re.IGNORECASE)
                    email_body = re.sub(r'^\*\*Email Version\*\*[\r\n]+', '', email_body, flags=re.IGNORECASE)
                
                if email_body:
                    email_body = email_body.strip()
                    
                    # Extract Subject
                    subject = "Quick question regarding your website"
                    subject_match = re.match(r'^(?:Subject:\s*)?(.*?)[\r\n]+(.*)', email_body, re.DOTALL | re.IGNORECASE)
                    if subject_match:
                        subject = subject_match.group(1).strip()
                        email_body = subject_match.group(2).strip()

                    parsed_leads.append({
                        'client_id': client_id,
                        'email': target_email,
                        'platform_reasoning': platform_text,
                        'subject': subject,
                        'message': email_body,
                        'audit_text': audit_text
                    })
                
    return parsed_leads

def send_email(target_email, subject, body, audit_text=None):
    """Sends an email using Gmail SMTP with both plain-text and gorgeous HTML versions, and attaches a PDF audit file."""
    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = GMAIL_ADDRESS
    msg['To'] = target_email

    # Plain Text Fallback
    msg.set_content(body)
    
    # HTML Version using Markdown
    html_body = markdown.markdown(body, extensions=['extra', 'nl2br'])
    html_body = re.sub(r'tel:(\+?\d+)', r'<a href="tel:\1" style="color: #1a73e8; text-decoration: none;">\1</a>', html_body)
    
    html_content = f"""
    <html>
      <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #333333; font-size: 14px; max-width: 600px;">
        {html_body}
      </body>
    </html>
    """
    
    msg.add_alternative(html_content, subtype='html')

    # Attach the audit text as a beautifully formatted PDF file
    if audit_text:
        audit_html = markdown.markdown(audit_text, extensions=['extra', 'tables'])
        
        premium_html_attachment = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Website UX & SEO Audit</title>
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.8; color: #111827; max-width: 800px; margin: 0 auto; padding: 40px; background-color: #f3f4f6; }}
                .container {{ background: white; padding: 50px; border-radius: 12px; border-top: 6px solid #2563eb; }}
                h1, h2, h3 {{ color: #1e3a8a; margin-top: 30px; }}
                h1 {{ font-size: 2.2em; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }}
                ul, ol {{ padding-left: 20px; }}
                li {{ margin-bottom: 10px; }}
                table {{ width: 100%; border-collapse: collapse; margin-top: 20px; margin-bottom: 20px; }}
                th, td {{ padding: 14px; text-align: left; border-bottom: 1px solid #e5e7eb; }}
                th {{ background-color: #f8fafc; font-weight: bold; color: #1e293b; }}
                .footer {{ margin-top: 50px; text-align: center; color: #64748b; font-size: 0.9em; }}
                a {{ color: #2563eb; text-decoration: none; font-weight: bold; }}
            </style>
        </head>
        <body>
            <div class="container">
                {audit_html}
                <div class="footer">Prepared securely by Axiom Digital Architecture</div>
            </div>
        </body>
        </html>
        """
        
        pdf_buffer = io.BytesIO()
        pisa_status = pisa.CreatePDF(premium_html_attachment, dest=pdf_buffer)
        
        if not pisa_status.err:
            msg.add_attachment(
                pdf_buffer.getvalue(),
                maintype='application',
                subtype='pdf',
                filename='Website_UX_SEO_Audit.pdf'
            )
        else:
            msg.add_attachment(
                premium_html_attachment.encode('utf-8'),
                maintype='text',
                subtype='html',
                filename='Website_UX_SEO_Audit.html'
            )

    try:
        server = smtplib.SMTP_SSL('smtp.gmail.com', 465)
        server.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
        server.send_message(msg)
        server.quit()
        return True, "Email sent successfully!"
    except Exception as e:
        return False, str(e)

def update_crm(client_id):
    """Updates the Outreach Platform column in Google Sheets to 'email-sent'."""
    try:
        worksheet = init_gspread()
        records = worksheet.get_all_records()
        headers = worksheet.row_values(1)
        
        if 'Outreach Platform' not in headers:
            return False, "Column 'Outreach Platform' not found in CRM."
            
        col_index = headers.index('Outreach Platform') + 1
        
        for i, row in enumerate(records):
            if str(row.get('Client ID', '')) == str(client_id):
                row_index = i + 2 # Header is row 1
                worksheet.update_cell(row_index, col_index, "email-sent")
                return True, "CRM Updated"
                
        return False, "Client ID not found in sheet."
    except Exception as e:
        return False, str(e)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("🤖 Sales Outreach Bot v8 (Bulk Sender) is online.\nUse /scan or /scan range [x:y] -{a,b,c} to view leads.")

async def scan(update: Update, context: ContextTypes.DEFAULT_TYPE):
    msg_text = update.message.text.strip()
    
    start_id = None
    end_id = None
    exclude_args = []
    is_batch_mode = False
    
    # Parse range if provided, e.g. /scan range [1:50] -{5,10}
    if "range" in msg_text.lower():
        range_match = re.search(r'\[(\d+):(\d+)\]', msg_text)
        if range_match:
            start_id = int(range_match.group(1))
            end_id = int(range_match.group(2))
            is_batch_mode = True
            
        excl_match = re.search(r'-\{([0-9, ]+)\}', msg_text)
        if excl_match:
            exclude_args = [int(x.strip()) for x in excl_match.group(1).split(',')]
            
    await update.message.reply_text("🔄 Syncing with CRM to filter out already-sent leads...")
    
    sent_ids = get_sent_ids()
    leads = parse_reports(exclude_ids=sent_ids)
    
    if is_batch_mode:
        filtered_leads = []
        for lead in leads:
            try:
                cid = int(lead['client_id'])
                if start_id <= cid <= end_id and cid not in exclude_args:
                    filtered_leads.append(lead)
            except ValueError:
                pass
        leads = filtered_leads
        
    if not leads:
        await update.message.reply_text("🔍 Scanned reports but found 0 valid unsent Email leads matching that criteria.")
        return
        
    keyboard = []
    
    if is_batch_mode:
        text = f"🔍 **BATCH MODE**\nFound {len(leads)} unsent leads in range [{start_id}:{end_id}]"
        if exclude_args:
            text += f"\nExcluded: {', '.join(map(str, exclude_args))}"
        text += "\n\n"
        
        # We store the IDs in context so we bypass the 64-byte callback limit
        context.user_data['current_batch_leads'] = [l['client_id'] for l in leads]
        keyboard.append([InlineKeyboardButton(f"🚀 Approve & Send Batch ({len(leads)} Leads)", callback_data="approve_batch_current")])
        keyboard.append([InlineKeyboardButton("❌ Cancel", callback_data="cancel_batch")])
        
    else:
        # Standard individual mode
        text = f"🔍 Found {len(leads)} unsent leads ready for Email outreach:\n\n"
        for lead in leads:
            email_str = lead['email'][0]
            if len(lead['email']) > 1:
                email_str += f" (+{len(lead['email'])-1} more)"
            
            audit_tag = " [📎 Audit Attached]" if lead.get('audit_text') else ""
            text += f"ID: {lead['client_id']} - {email_str}{audit_tag}\n"
            keyboard.append([InlineKeyboardButton(f"Preview Lead {lead['client_id']}", callback_data=f"select_{lead['client_id']}")])

    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text(text, reply_markup=reply_markup)

async def background_batch_sender(update: Update, context: ContextTypes.DEFAULT_TYPE, batch_ids: list):
    chat_id = update.effective_chat.id
    sent_count = 0
    
    await context.bot.send_message(chat_id, "⏳ Background dispatch started. I will send a status update every time an email goes out. (Delay: 10-30s between emails).")
    
    for i, client_id in enumerate(batch_ids):
        leads = parse_reports()
        selected = next((l for l in leads if str(l['client_id']) == str(client_id)), None)
        
        if not selected:
            await context.bot.send_message(chat_id, f"⚠️ Lead {client_id} data lost. Skipping.")
            continue
            
        sent_ids = get_sent_ids()
        if str(client_id) in sent_ids:
            await context.bot.send_message(chat_id, f"⏭️ Lead {client_id} already emailed. Skipping.")
            continue
            
        # Send to all emails
        emails_to_send = selected['email']
        all_success = True
        errs = []
        for email_addr in emails_to_send:
            success, error_msg = send_email(email_addr, selected['subject'], selected['message'], selected.get('audit_text'))
            if not success:
                all_success = False
                errs.append(f"{email_addr}: {error_msg}")
                
        if all_success:
            update_crm(client_id)
            sent_count += 1
            await context.bot.send_message(chat_id, f"✅ [{i+1}/{len(batch_ids)}] Successfully sent to Lead {client_id} ({', '.join(emails_to_send)})")
        else:
            await context.bot.send_message(chat_id, f"❌ [{i+1}/{len(batch_ids)}] Failed for Lead {client_id}: {', '.join(errs)}")
            
        # Random delay before next one (if not the last one)
        if i < len(batch_ids) - 1:
            delay = random.randint(10, 30)
            await asyncio.sleep(delay)
            
    await context.bot.send_message(chat_id, f"🎉 Batch Complete! Successfully processed {sent_count}/{len(batch_ids)} leads.")

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer() 
    
    data = query.data
    
    if data == "approve_batch_current":
        batch_ids = context.user_data.get('current_batch_leads', [])
        if not batch_ids:
            await query.edit_message_text("❌ Batch expired or not found.")
            return
            
        await query.edit_message_text(f"🚀 Launching background dispatcher for {len(batch_ids)} leads...")
        asyncio.create_task(background_batch_sender(update, context, batch_ids))
        
    elif data == "cancel_batch":
        await query.edit_message_text("❌ Batch canceled.")
        
    elif data.startswith("select_"):
        client_id = data.split("_")[1]
        
        sent_ids = get_sent_ids()
        if client_id in sent_ids:
            await query.edit_message_text(f"❌ Lead {client_id} was already emailed! (Checked CRM)")
            return
            
        leads = parse_reports()
        selected = next((l for l in leads if str(l['client_id']) == client_id), None)
        
        if not selected:
            await query.edit_message_text(f"❌ Lead {client_id} file not found.")
            return
            
        email_str = ", ".join(selected['email'])
        audit_status = "✅ Generated (Premium PDF)" if selected.get('audit_text') else "❌ None"
        
        preview_text = (
            f"📋 **Lead ID:** {selected['client_id']}\n"
            f"📧 **Target Emails:** {email_str}\n"
            f"📎 **Audit File:** {audit_status}\n"
            f"🤖 **AI Reasoning:** {selected['platform_reasoning']}\n\n"
            f"**Subject:** {selected['subject']}\n\n"
            f"📝 **Message Draft:**\n\n{selected['message']}"
        )
        
        keyboard = []
        if len(selected['email']) > 1:
            for i, email in enumerate(selected['email']):
                keyboard.append([InlineKeyboardButton(f"✉️ Send to: {email}", callback_data=f"approve_{client_id}_{i}")])
            keyboard.append([InlineKeyboardButton(f"🚀 Send to ALL ({len(selected['email'])})", callback_data=f"approve_{client_id}_all")])
        else:
            keyboard.append([InlineKeyboardButton("✅ Approve & Send", callback_data=f"approve_{client_id}_0")])
            
        keyboard.append([InlineKeyboardButton("❌ Reject", callback_data=f"reject_{client_id}")])
        
        reply_markup = InlineKeyboardMarkup(keyboard)
        await query.message.reply_text(preview_text, reply_markup=reply_markup, parse_mode=None)

    elif data.startswith("approve_"):
        parts = data.split("_")
        client_id = parts[1]
        target_idx = parts[2]
        
        sent_ids = get_sent_ids()
        if client_id in sent_ids:
            await query.edit_message_text(f"⚠️ Email was already sent to Lead {client_id}!")
            return
            
        leads = parse_reports()
        selected = next((l for l in leads if str(l['client_id']) == client_id), None)
        
        if not selected:
            await query.edit_message_text("❌ Lead data lost.")
            return
            
        emails_to_send = []
        if target_idx == "all":
            emails_to_send = selected['email']
        else:
            emails_to_send = [selected['email'][int(target_idx)]]
            
        await query.edit_message_text(f"🚀 Sending email to {len(emails_to_send)} recipient(s) for Lead {client_id}...")
        
        all_success = True
        err_msgs = []
        for email_addr in emails_to_send:
            success, error_msg = send_email(email_addr, selected['subject'], selected['message'], selected.get('audit_text'))
            if not success:
                all_success = False
                err_msgs.append(f"{email_addr}: {error_msg}")
        
        if all_success:
            response_text = f"✅ Sent to {', '.join(emails_to_send)}!\n"
            if selected.get('audit_text'):
                response_text += "📎 Premium PDF Audit Attached!\n"
            crm_success, crm_msg = update_crm(client_id)
            if crm_success:
                response_text += "✅ CRM Updated with 'email-sent'"
            else:
                response_text += f"⚠️ CRM update failed: {crm_msg}"
                
            await query.edit_message_text(response_text)
        else:
            await query.edit_message_text(f"❌ Failed: {', '.join(err_msgs)}")

    elif data.startswith("reject_"):
        parts = data.split("_")
        client_id = parts[1]
        await query.edit_message_text(f"⏭️ Skipped Lead {client_id}.")

if __name__ == '__main__':
    if not TELEGRAM_TOKEN or TELEGRAM_TOKEN == "your_sales_bot_token":
        print("Error: TELEGRAM_SALES_BOT_TOKEN not set in .env")
        exit(1)
        
    print("Starting Sales Telegram Bot v8 (Bulk Sender)...")
    app = Application.builder().token(TELEGRAM_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("scan", scan))
    app.add_handler(CallbackQueryHandler(button_handler))

    app.run_polling()
