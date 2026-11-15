import nodemailer from 'nodemailer'

const getTransporter = () => {
  const emailUser = process.env.EMAIL_USER
  const emailPass = process.env.EMAIL_PASS?.replace(/\s/g, '')

  if (!emailUser || !emailPass) {
    throw new Error('Missing SMTP credentials: set EMAIL_USER and EMAIL_PASS in backend/.env')
  }

  console.log('SMTP credentials loaded:', {
    emailUser: Boolean(emailUser),
    emailPass: Boolean(emailPass)
  })

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    tls: {
      minVersion: 'TLSv1.2'
    },
    auth: {
      user: emailUser,
      pass: emailPass
    }
  })
}

const escapeHtml = (value) => String(value ?? '—')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

const formatReceiptRows = (details = {}) => Object.entries(details)
  .map(([label, value]) => `<tr><td style="padding:8px 0;color:#64748b;width:150px;">${escapeHtml(label)}</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(value)}</td></tr>`)
  .join('')

export const sendBookingReceiptEmail = async ({ email, category, orderNumber, buyerName, details = {}, items = [], total }) => {
  if (!email || !String(email).includes('@')) {
    console.warn(`Receipt email skipped for ${category}: no valid recipient email`)
    return null
  }

  const itemRows = items.length
    ? `<h3 style="color:#a1741b;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">Ordered Items</h3><table style="width:100%;border-collapse:collapse;">${items.map((item) => `<tr><td style="padding:7px 0;">${escapeHtml(item.name || item.itemName || 'Item')} ${item.quantity ? `× ${escapeHtml(item.quantity)}` : ''}</td><td style="padding:7px 0;text-align:right;">PKR ${Number(item.amount ?? item.itemPrice ?? item.price ?? 0).toLocaleString()}</td></tr>`).join('')}</table>`
    : ''

  const mailOptions = {
    from: `Mughal Mahal <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `Mughal Mahal ${category} receipt - ${orderNumber}`,
    text: `Mughal Mahal ${category} receipt for order ${orderNumber}. Your booking request has been received successfully.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#182234;border:1px solid #e5e7eb;padding:28px;background:#fff;">
      <div style="display:flex;justify-content:space-between;border-bottom:3px solid #bf9236;padding-bottom:18px;"><div><h1 style="margin:0;color:#a1741b;font-size:24px;">MUGHAL MAHAL</h1><p style="margin:5px 0;color:#64748b;">Hotel, Dining &amp; Events</p></div><div style="text-align:right;"><h2 style="margin:0;">RECEIPT</h2><p style="margin:5px 0;color:#64748b;">Order No: ${escapeHtml(orderNumber)}</p></div></div>
      <div style="background:#fff8e6;border:1px solid #eed9a0;padding:14px;margin:22px 0;"><strong>Order Confirmation</strong><div style="margin-top:5px;">Your ${escapeHtml(category)} request has been received successfully.</div></div>
      <h3 style="color:#a1741b;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">Buyer Details</h3><table style="width:100%;border-collapse:collapse;">${formatReceiptRows({ Name: buyerName, Email: email, Category: category, Status: 'Order Placed' })}</table>
      <h3 style="color:#a1741b;border-bottom:1px solid #e5e7eb;padding-bottom:8px;margin-top:22px;">Booking Details</h3><table style="width:100%;border-collapse:collapse;">${formatReceiptRows(details)}</table>${itemRows}
      <div style="border-top:2px solid #182234;margin-top:22px;padding-top:12px;text-align:right;font-size:20px;font-weight:700;color:#a1741b;">Total: PKR ${Number(total || 0).toLocaleString()}</div>
      <p style="border-top:1px solid #e5e7eb;margin-top:28px;padding-top:14px;color:#64748b;font-size:12px;">Please keep this receipt for your booking/order reference. Our team will contact you for confirmation.</p>
    </div>`
  }

  try {
    const transporter = getTransporter()
    return await transporter.sendMail(mailOptions)
  } catch (error) {
    console.error(`Failed to send ${category} receipt email:`, error.message)
    return null
  }
}

export const sendOtpEmail = async ({ email, otp }) => {
  try {
    const transporter = getTransporter()
    const mailOptions = {
      from: `Mughal Mahal <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Mughal Mahal Booking Verification Code',
      text: `Mughal Mahal booking verification code: ${otp}. This code expires in 10 minutes.`,
      html: `
        <div style="width:100%;box-sizing:border-box;font-family:Arial,sans-serif;color:#182234;background:#fffdf7;padding:24px;line-height:1.5;">
          <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #ead9ad;padding:24px;box-sizing:border-box;">
            <div style="border-bottom:3px solid #bf9236;padding-bottom:16px;text-align:center;">
              <h1 style="margin:0;color:#a1741b;font-size:26px;line-height:1.25;letter-spacing:.06em;">MUGHAL MAHAL</h1>
              <p style="margin:6px 0 0;color:#64748b;font-size:13px;">Experience Royalty</p>
            </div>
            <h2 style="margin:22px 0 12px;color:#b76e03;font-size:20px;line-height:1.3;">Booking Verification Code</h2>
            <p style="margin:0 0 16px;">Enter this code in Mughal Mahal to complete your registration. It expires in 10 minutes.</p>
            <p style="margin:0 0 16px;font-size:28px;line-height:1.2;font-weight:700;letter-spacing:6px;color:#a1741b;">${otp}</p>
            <p style="margin:0;color:#64748b;font-size:13px;">If you did not request this code, you can ignore this email.</p>
          </div>
        </div>
      `
    }
    return await transporter.sendMail(mailOptions)
  } catch (error) {
    console.error('Failed to send OTP email:', error.code || error.message)
    throw new Error('Unable to send OTP email. Check the Gmail app password and SMTP settings.')
  }
}

export const sendPasswordResetEmail = async ({ email, token, frontendUrl: requestedFrontendUrl }) => {
  const frontendUrl = (requestedFrontendUrl || process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')
  const resetUrl = `${frontendUrl}/reset-password/${token}`

  try {
    const transporter = getTransporter()
    return await transporter.sendMail({
      from: `Mughal Mahal <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Mughal Mahal Password Reset',
      text: 'Mughal Mahal password reset. Use the secure link in this email to create a new password.',
      html: `
        <div style="width:100%;box-sizing:border-box;font-family:Arial,sans-serif;color:#182234;background:#fffdf7;padding:24px;line-height:1.5;">
          <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #ead9ad;padding:24px;box-sizing:border-box;">
            <div style="border-bottom:3px solid #bf9236;padding-bottom:16px;text-align:center;">
              <h1 style="margin:0;color:#a1741b;font-size:26px;line-height:1.25;letter-spacing:.06em;">MUGHAL MAHAL</h1>
              <p style="margin:6px 0 0;color:#64748b;font-size:13px;">Experience Royalty</p>
            </div>
            <h2 style="color:#a1741b;margin:22px 0 12px;font-size:21px;line-height:1.3;">Create a new password</h2>
            <p style="margin:0 0 18px;">We received a request to change your Mughal Mahal login password.</p>
            <p style="margin:0 0 20px;text-align:center;"><a href="${resetUrl}" style="display:inline-block;background:#b88920;color:#fff;text-decoration:none;padding:13px 22px;border-radius:24px;font-weight:700;line-height:1.2;">Reset Password</a></p>
            <p style="margin:0 0 8px;color:#64748b;font-size:13px;line-height:1.45;">This reset link expires in 5 minutes. If you did not request it, you can safely ignore this email.</p>
            <p style="margin:0;color:#64748b;font-size:13px;line-height:1.45;">For your security, the link can only be used once.</p>
          </div>
        </div>
      `
    })
  } catch (error) {
    console.error('Failed to send password reset email:', error.code || error.message)
    throw new Error('Unable to send password reset email. Check the Gmail app password and SMTP settings.')
  }
}

export const sendPasswordChangedEmail = async ({ email, changedAt, device, location, ipAddress }) => {
  try {
    const transporter = getTransporter()
    return await transporter.sendMail({
      from: `Mughal Mahal <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Mughal Mahal Login Password Updated',
      text: 'Mughal Mahal login password updated successfully.',
      html: `
        <div style="width:100%;box-sizing:border-box;font-family:Arial,sans-serif;color:#182234;background:#fffdf7;padding:24px;line-height:1.5;">
          <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #ead9ad;padding:24px;box-sizing:border-box;">
            <div style="border-bottom:3px solid #bf9236;padding-bottom:16px;text-align:center;">
              <h1 style="margin:0;color:#a1741b;font-size:26px;line-height:1.25;letter-spacing:.06em;">MUGHAL MAHAL</h1>
              <p style="margin:6px 0 0;color:#64748b;font-size:13px;">Experience Royalty</p>
            </div>
            <h2 style="color:#a1741b;margin:22px 0 12px;font-size:21px;line-height:1.3;">Login password updated</h2>
            <p style="margin:0 0 18px;">Your Mughal Mahal login password was changed successfully.</p>
            <div style="background:#fff8e6;border:1px solid #ead9ad;padding:16px;margin:0 0 18px;">
              <p style="margin:0 0 9px;"><strong>Time:</strong> ${escapeHtml(changedAt)}</p>
              <p style="margin:0 0 9px;"><strong>Device:</strong> ${escapeHtml(device)}</p>
              <p style="margin:0 0 9px;"><strong>Location:</strong> ${escapeHtml(location)}</p>
              <p style="margin:0;"><strong>IP address:</strong> ${escapeHtml(ipAddress)}</p>
            </div>
            <p style="margin:0;color:#64748b;font-size:13px;line-height:1.45;">If you did not make this change, please contact Mughal Mahal support immediately.</p>
          </div>
        </div>
      `
    })
  } catch (error) {
    console.error('Failed to send password changed email:', error.code || error.message)
    return null
  }
}
