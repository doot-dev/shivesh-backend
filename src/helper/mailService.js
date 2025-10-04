import nodemailer from "nodemailer";
export async function sendMail(mailOptions) {
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.EMAIL_ID,
            pass: process.env.PASSWORD,
        },
        port: 465,
        secure: true,
        timeout: 30000,
    });
    await transporter.sendMail(mailOptions);
}


// Prepare email options
//     const mailOptions = {
//       from: process.env.EMAILID,
//       to: email,
//       subject: "Email Verification",
//       html: getEmailVerificationMessage(otpCode),
//     };
export function getEmailVerificationMessage(otpCode) {
    return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Shivesh - Email Verification</title>
      <style>
          body {
              font-family: Arial, sans-serif;
              background-color: #f5f5f5;
              margin: 0;
              padding: 0;
          }
          .container {
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #fff;
              border-radius: 5px;
              box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
          }
          .header {
              background: linear-gradient(to right, #0c3b81ff, #299bffff);
              color: #fff;
              padding: 20px;
              text-align: left;
              border-top-left-radius: 5px;
              border-top-right-radius: 5px;
          }
          .content {
              padding: 20px;
              color: #333;
          }
          h1 {
              font-size: 28px;
              margin: 0;
          }
          p {
              font-size: 16px;
              margin-top: 10px;
              line-height: 1.5;
          }
          .otp {
              font-size: 36px;
              font-weight: bold;
              color: #0c3b81ff;
              margin-top: 15px;
              text-align: center;
          }
          .note {
              font-size: 14px;
              color: #888;
              margin-top: 10px;
          }
          .button {
              display: inline-block;
              padding: 10px 20px;
              background-color: #0c3b81ff;
              color: #fff;
              text-decoration: none;
              border-radius: 5px;
              margin-top: 20px;
          }
      </style>
  </head>
  <body>
      <div class="container">
          <div class="header">
              <h1>Shivesh</h1>
              <p>Email Verification</p>
          </div>
          <div class="content">
              <p>Dear Shivesh User,</p>
              <p>We hope this message finds you well.</p>
              <p>Your One-Time Password (OTP) for email verification is:</p>
              <p class="otp">${otpCode}</p>
              <p class="note">This OTP will expire in 5 minutes. Please use it to verify your email address and access your shivesh account securely.</p>
              <p class="note">If you did not request this verification, please ignore this email.</p>
              <p>Thank you for choosing shivesh for all your pet-related needs. Your trust in us is greatly appreciated, and we are dedicated to providing a secure and enjoyable shopping experience.</p>
              <p>Best regards,</p>
              <p>shivesh Team</p>
              <a href="https://shivesh-web.vercel.app/" class="button">Shivesh Website</a>
          </div>
      </div>
  </body>
  </html>
  

 `;
}