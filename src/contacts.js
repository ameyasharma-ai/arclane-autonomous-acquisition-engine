import fs from 'fs';
import path from 'path';

export class ContactManager {
    constructor() {
        this.exportsDir = path.join(process.cwd(), 'exports');
        if (!fs.existsSync(this.exportsDir)) {
            fs.mkdirSync(this.exportsDir, { recursive: true });
        }
    }

    cleanPhoneNumber(phoneStr) {
        if (!phoneStr) return null;
        let digits = phoneStr.replace(/\D/g, '');
        if (digits.startsWith('0') && digits.length === 11) {
            digits = '91' + digits.substring(1);
        } else if (digits.length === 10) {
            digits = '91' + digits;
        }
        return digits.length >= 10 ? '+' + digits : null;
    }

    generateVCF(contactList) {
        let vcfContent = '';
        for (const c of contactList) {
            const formattedPhone = this.cleanPhoneNumber(c.phone);
            if (!formattedPhone) continue;

            const name = c.businessName || `Client ${c.clientId}`;
            vcfContent += `BEGIN:VCARD\n`;
            vcfContent += `VERSION:3.0\n`;
            vcfContent += `FN:${name}\n`;
            vcfContent += `ORG:${name}\n`;
            vcfContent += `TEL;TYPE=CELL,VOICE:${formattedPhone}\n`;
            if (c.email && !c.email.toLowerCase().includes('not available')) {
                vcfContent += `EMAIL;TYPE=INTERNET:${c.email}\n`;
            }
            vcfContent += `NOTE:Client ID ${c.clientId} - Patna Business Lead\n`;
            vcfContent += `END:VCARD\n\n`;
        }

        const vcfPath = path.join(this.exportsDir, 'contacts.vcf');
        fs.writeFileSync(vcfPath, vcfContent, 'utf-8');
        return vcfPath;
    }

    generateCSV(contactList) {
        let csvContent = 'Name,Given Name,Family Name,Organization Name,Phone 1 - Type,Phone 1 - Value,E-mail 1 - Value\n';
        for (const c of contactList) {
            const formattedPhone = this.cleanPhoneNumber(c.phone);
            if (!formattedPhone) continue;

            const name = (c.businessName || `Client ${c.clientId}`).replace(/,/g, '');
            const email = (c.email && !c.email.toLowerCase().includes('not available')) ? c.email : '';
            csvContent += `"${name}","${name}","","${name}","Mobile","${formattedPhone}","${email}"\n`;
        }

        const csvPath = path.join(this.exportsDir, 'contacts.csv');
        fs.writeFileSync(csvPath, csvContent, 'utf-8');
        return csvPath;
    }
}
