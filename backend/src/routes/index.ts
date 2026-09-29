import express, { Router } from 'express';
import { env } from '../config/env';
import { requireAdmin, requireDonor, requirePhone, requireStaff } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { rateLimit } from '../middlewares/rateLimit';
import { letterUpload } from '../middlewares/upload';
import * as s from '../validations/schemas';
import { authController as auth } from '../controllers/auth.controller';
import { publicController as pub } from '../controllers/public.controller';
import { familyController as family } from '../controllers/family.controller';
import { faskesController as fk } from '../controllers/faskes.controller';
import { donorController as donor } from '../controllers/donor.controller';
import { adminController as admin } from '../controllers/admin.controller';
import { webhookController as webhook } from '../controllers/webhook.controller';

const router = Router();

// ---------- auth ----------
router.post('/auth/staff/login', rateLimit('login', 10, 300), validate(s.staffLoginSchema), auth.staffLogin);
router.post('/auth/otp/request', rateLimit('otp', 10, 600), validate(s.otpRequestSchema), auth.requestOtp);
router.post('/auth/otp/verify', rateLimit('otp-verify', 20, 600), validate(s.otpVerifySchema), auth.verifyOtp);

// ---------- webhooks (shared secret in the url) ----------
router.post('/webhooks/whatsapp', express.urlencoded({ extended: false }), rateLimit('wa-webhook', 120, 60), webhook.whatsapp);

// ---------- public (no auth) ----------
router.get('/public/meta', pub.meta);
router.get('/public/faskes', pub.faskes);
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
router.use('/faskes/me', staff);

// ---------- donor ----------
router.post('/donors/register', requirePhone('DONOR'), validate(s.registerDonorSchema), donor.register);
const dn = Router();
dn.use(requireDonor);
dn.get('/', donor.dashboard);
dn.patch('/area', validate(s.updateAreaSchema), donor.updateArea);
dn.delete('/', donor.deactivate);
dn.post('/reactivate', donor.reactivate);
dn.post('/tickets/:id/respond', validate(s.respondSchema), donor.respond);
dn.post('/tickets/:id/cancel', validate(s.idParamSchema), donor.cancel);
dn.post('/tickets/:id/ack', validate(s.idParamSchema), donor.acknowledge);
if (env.enableDemoRoutes) dn.post('/demo/finish-recovery', donor.finishRecovery);
router.use('/donors/me', dn);

// ---------- super admin ----------
const adm = Router();
adm.use(requireAdmin);
adm.get('/overview', admin.overview);
adm.get('/faskes', admin.listFaskes);
adm.post('/faskes', validate(s.createFaskesSchema), admin.createFaskes);
adm.patch('/faskes/:id/active', validate(s.activeSchema), admin.setFaskesActive);
adm.get('/users', admin.listUsers);
adm.post('/users', validate(s.createUserSchema), admin.createUser);
adm.patch('/users/:id/active', validate(s.activeSchema), admin.setUserActive);
adm.get('/audit', validate(s.auditQuerySchema), admin.audit);
router.use('/admin', adm);

export default router;
