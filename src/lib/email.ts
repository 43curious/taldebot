import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.example.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    auth: {
        user: process.env.SMTP_USER || 'user@example.com',
        pass: process.env.SMTP_PASS || 'password',
    },
});

export interface TeamAssignmentEmail {
    to: string;
    studentName: string;
    projectName: string;
    teamNumber: number;
    members: string[];
    topSkills: string[];
}

export async function sendTeamNotification(data: TeamAssignmentEmail) {
    const { to, studentName, projectName, teamNumber, members } = data;

    // Check if email is configured
    if (!process.env.SMTP_HOST) {
        console.log('--- EMAIL SIMULATION (SMTP_HOST not set) ---');
        console.log(`To: ${to}`);
        console.log(`Subject: ${projectName} proiekturako zure taldea`);
        console.log(`Body: Kaixo ${studentName}, ${projectName} proiektuan talde honetan zaude: ${teamNumber}...`);
        console.log('-------------------------------------------');
        return { success: true };
    }

    const mailOptions = {
        from: `"TaldeBOT" <${process.env.SMTP_USER || 'noreply@example.com'}>`,
        to,
        subject: `${projectName} proiekturako zure taldea`,
        text: `
Kaixo ${studentName},

"${projectName}" proiektuan hurrengo taldean esleitu zaizu, ${teamNumber}.

Hauek dira zure taldekideak: ${members.join(', ')}.

Zorte on proiektuarekin!
- TaldeBOT Taldea
    `,
        html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h1 style="color: #2563eb;">TaldeBOT</h1>
        <p>Kaixo <strong>${studentName}</strong>,</p>
        <p><strong>"${projectName}"</strong> proiektuan hurrengo taldean esleitu zaizu, <strong>${teamNumber}</strong>.</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h2 style="margin-top: 0;">${teamNumber}. taldea</h2>
          <p><strong>Zure taldekideak:</strong></p>
          <ul>
            ${members.map(m => `<li>${m}</li>`).join('')}
          </ul>
        </div>
        
        <p>Zorte on proiektuarekin!</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="font-size: 12px; color: #999;">TaldeBOT-ek automatikoki bidalitako mezua da hau.</p>
      </div>
    `,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${to}`);
        return { success: true };
    } catch (error) {
        console.error('Email error:', error);
        return { success: false, error };
    }
}
