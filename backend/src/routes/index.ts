import express, { Router } from 'express';
import { env } from '../config/env';
import { requireAdmin, requireDonor, requirePhone, requireStaff } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { rateLimit } from '../middlewares/rateLimit';
import { letterUpload, xlsxUpload } from '../middlewares/upload';
import * as s from '../validations/schemas';
import { authController as auth } from '../controllers/auth.controller';
import { publicController as pub } from '../controllers/public.controller';
import { familyController as family } from '../controllers/family.controller';
import { faskesController as fk } from '../controllers/faskes.controller';
import { donorController as donor } from '../controllers/donor.controller';
import { adminController as admin } from '../controllers/admin.controller';
import { webhookController as webhook } from '../controllers/webhook.controller';
import { exportController as exporter } from '../controllers/export.controller';
import { importController as importer } from '../controllers/import.controller';

const router = Router();

// ---------- auth ----------
router.post('/auth/staff/login', rateLimit('login', 10, 300), validate(s.staffLoginSchema), auth.staffLogin);
router.post('/auth/otp/request', rateLimit('otp', 10, 600), validate(s.otpRequestSchema), auth.requestOtp);
router.post('/auth/otp/verify', rateLimit('otp-verify', 20, 600), validate(s.otpVerifySchema), auth.verifyOtp);
router.get('/auth/me', auth.me);
router.post('/auth/logout', auth.logout);

// ---------- webhooks (shared secret in the url) ----------
// fonnte delivers every donor reply from one ip, so the cap must stay above a full dispatch wave
router.post('/webhooks/whatsapp', express.urlencoded({ extended: false }), rateLimit('wa-webhook', 600, 60), webhook.whatsapp);
// fonnte requires the url to accept GET too; with no body this only checks the secret
router.get('/webhooks/whatsapp', rateLimit('wa-webhook', 600, 60), webhook.whatsapp);

// ---------- public (no auth) ----------
router.get('/public/meta', pub.meta);
router.get('/public/facilities', pub.faskes);
router.get('/public/cards/:token', validate(s.tokenParamSchema), pub.card);

// ---------- patient family (phone verified by otp) ----------
const fam = Router();
fam.use(requirePhone('FAMILY'));
fam.post('/', rateLimit('create-request', 5, 3600), letterUpload, validate(s.createRequestSchema), family.create);
fam.get('/', family.listMine);
fam.get('/:id', validate(s.idParamSchema), family.detail);
fam.post('/:id/cancel', validate(s.idParamSchema), family.cancel);
router.use('/requests', fam);

// ---------- faskes staff (scoped to the staff's own faskes) ----------
const staff = Router();
staff.use(requireStaff);
staff.get('/', fk.me);
staff.get('/dashboard', fk.dashboard);
staff.get('/stock', fk.stock);
staff.post('/stock/adjust', validate(s.adjustStockSchema), fk.adjustStock);
staff.get('/movements', validate(s.limitSchema), fk.movements);
staff.get('/donor-pool', fk.donorPool);
staff.get('/arrivals', fk.arrivals);
staff.get('/requests', validate(s.requestListSchema), fk.listRequests);
staff.get('/requests/:id', validate(s.idParamSchema), fk.requestDetail);
staff.get('/requests/:id/letter', validate(s.idParamSchema), fk.letter);
staff.get('/requests/:id/stock-options', validate(s.idParamSchema), fk.stockOptions);
staff.post('/requests/:id/approve', validate(s.idParamSchema), fk.approve);
staff.post('/requests/:id/reject', validate(s.rejectSchema), fk.reject);
staff.post('/requests/:id/allocate', validate(s.idParamSchema), fk.allocate);
staff.post('/requests/:id/transfer', validate(s.transferSchema), fk.transfer);
staff.get('/transfers', fk.transfers);
staff.post('/transfers/:id/approve', validate(s.idParamSchema), fk.approveTransfer);
staff.post('/transfers/:id/reject', validate(s.idParamSchema), fk.rejectTransfer);
staff.post('/requests/:id/dispatch', validate(s.dispatchSchema), fk.dispatch);
staff.post('/requests/:id/close', validate(s.idParamSchema), fk.close);
staff.post('/tickets/scan', validate(s.scanSchema), fk.scan);
staff.post('/tickets/:id/screening', validate(s.screeningSchema), fk.screening);
staff.post('/tickets/:id/collect', validate(s.idParamSchema), fk.collect);
staff.post('/tickets/:id/no-show', validate(s.idParamSchema), fk.noShow);
staff.get('/notifications', validate(s.notificationListSchema), fk.notifications);
staff.post('/notifications/read-all', fk.readAllNotifications);
staff.post('/push-tokens', rateLimit('push-token', 30, 600), validate(s.pushTokenSchema), fk.addPushToken);
staff.delete('/push-tokens', validate(s.pushTokenSchema), fk.removePushToken);
staff.post('/notifications/:id/read', validate(s.idParamSchema), fk.readNotification);
staff.get('/export/:dataset', rateLimit('export', 30, 600), validate(s.staffExportSchema), exporter.staff);
staff.get('/import/:dataset/template', validate(s.staffImportSchema), importer.staffTemplate);
staff.post('/import/:dataset', rateLimit('import', 30, 600), xlsxUpload, validate(s.staffImportSchema), importer.staff);
router.use('/facility/me', staff);

// ---------- donor ----------
router.post('/donors/register', requirePhone('DONOR'), validate(s.registerDonorSchema), donor.register);
const dn = Router();
dn.use(requireDonor);
dn.get('/', donor.dashboard);
dn.patch('/area', validate(s.updateAreaSchema), donor.updateArea);
dn.patch('/location', rateLimit('donor-location', 20, 3600), validate(s.updateLocationSchema), donor.updateLocation);
dn.delete('/', donor.deactivate);
dn.post('/reactivate', donor.reactivate);
dn.post('/logout', donor.logout);
dn.post('/tickets/:id/respond', validate(s.respondSchema), donor.respond);
dn.post('/tickets/:id/cancel', validate(s.idParamSchema), donor.cancel);
dn.post('/tickets/:id/ack', validate(s.idParamSchema), donor.acknowledge);
dn.post('/push-tokens', rateLimit('push-token', 30, 600), validate(s.pushTokenSchema), donor.addPushToken);
dn.delete('/push-tokens', validate(s.pushTokenSchema), donor.removePushToken);
if (env.enableDemoRoutes) dn.post('/demo/finish-recovery', donor.finishRecovery);
router.use('/donors/me', dn);

// ---------- super admin ----------
const adm = Router();
adm.use(requireAdmin);
adm.get('/overview', admin.overview);
adm.get('/facilities', admin.listFaskes);
adm.post('/facilities', validate(s.createFaskesSchema), admin.createFaskes);
adm.patch('/facilities/:id', validate(s.updateFaskesSchema), admin.updateFaskes);
adm.delete('/facilities/:id', validate(s.idParamSchema), admin.deleteFaskes);
adm.patch('/facilities/:id/active', validate(s.activeSchema), admin.setFaskesActive);
adm.get('/users', admin.listUsers);
adm.post('/users', validate(s.createUserSchema), admin.createUser);
adm.patch('/users/:id', validate(s.updateUserSchema), admin.updateUser);
adm.delete('/users/:id', validate(s.idParamSchema), admin.deleteUser);
adm.patch('/users/:id/active', validate(s.activeSchema), admin.setUserActive);
adm.get('/audit-logs', validate(s.auditQuerySchema), admin.auditLogs);
adm.get('/audit-logs/:id', validate(s.idParamSchema), admin.auditLog);
adm.get('/export/:dataset', rateLimit('export', 30, 600), validate(s.adminExportSchema), exporter.admin);
adm.get('/import/:dataset/template', validate(s.adminImportSchema), importer.adminTemplate);
adm.post('/import/:dataset', rateLimit('import', 30, 600), xlsxUpload, validate(s.adminImportSchema), importer.admin);
router.use('/admin', adm);

export default router;
