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
    const { to, studentName, projectName, teamNumber, members, topSkills } = data;

    const roles = topSkills.length > 0
        ? `Based on your top skills in ${topSkills.join(', ')}, you might be well-suited for a specialized role in the team.`
        : '';

    const mailOptions = {
        from: `"TaldeBOT" <${process.env.SMTP_USER || 'noreply@example.com'}>`,
        to,
        subject: `Your Team Assignment for ${projectName}`,
        text: `
Hello ${studentName},

Your team assignments for the project "${projectName}" are ready!

You have been assigned to Team ${teamNumber}.
Your teammates are: ${members.join(', ')}.

${roles}

Good luck with your project!
- The TaldeBOT Team
    `,
        html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h1 style="color: #2563eb;">TaldeBOT</h1>
        <p>Hello <strong>${studentName}</strong>,</p>
        <p>Your team assignments for the project <strong>"${projectName}"</strong> are ready!</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h2 style="margin-top: 0;">Team ${teamNumber}</h2>
          <p><strong>Your teammates:</strong></p>
          <ul>
            ${members.map(m => `<li>${m}</li>`).join('')}
          </ul>
        </div>
        
        ${topSkills.length > 0 ? `<p>Based on your top skills in <strong>${topSkills.join(', ')}</strong>, you might be well-suited for a specialized role in the team.</p>` : ''}
        
        <p>Good luck with your project!</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="font-size: 12px; color: #999;">This is an automated message from TaldeBOT.</p>
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
