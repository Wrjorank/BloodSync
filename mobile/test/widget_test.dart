import 'package:bloodsync_donor/models/dashboard.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('dashboard tanpa undangan/tiket (backend mengirim false) terbaca sebagai null', () {
    final d = Dashboard.fromJson({
      'profile': {'id': 'd1', 'name': 'Budi Santoso', 'phone': '0812****789', 'bloodType': 'A+', 'area': 'Menteng', 'isActive': true, 'lastDonationAt': null},
      'eligibility': {'eligible': true, 'nextDate': null, 'daysLeft': 0, 'cycleDays': 60},
      'reminder': null,
      'invite': false,
      'activeTicket': false,
      'outcome': null,
      'badges': [
        {'id': 'first', 'label': 'Pahlawan Pertama', 'icon': 'fa-heart', 'earned': false},
      ],
      'donations': [],
    });
    expect(d.invite, isNull);
    expect(d.activeTicket, isNull);
    expect(d.profile.firstName, 'Budi');
    expect(d.badges.single.label, 'Pahlawan Pertama');
  });

  test('undangan dan tiket aktif terbaca lengkap', () {
    final faskes = {'id': 'f1', 'name': 'RSUD Tarakan', 'area': 'Gambir', 'lat': -6.17, 'lng': 106.81, 'mapsUrl': 'https://maps.example'};
    final d = Dashboard.fromJson({
      'profile': {'id': 'd1', 'name': 'Budi', 'phone': 'x', 'bloodType': 'O-', 'area': 'Menteng', 'isActive': true},
      'eligibility': {'eligible': true, 'daysLeft': 0, 'cycleDays': 60},
      'invite': {
        'ticketId': 't1', 'distanceKm': 2.4, 'etaMin': 7, 'wave': 1,
        'request': {'code': 'REQ-1', 'bloodType': 'A+', 'componentLabel': 'PRC', 'bagsNeeded': 2, 'urgency': 'KRITIS', 'deadline': '2026-10-06T10:00:00.000Z', 'compatibleOnly': true},
        'faskes': faskes,
      },
      'activeTicket': {
        'id': 't2', 'code': 'TKT-ABCD', 'qrPayload': 'BLOODSYNC:TKT-ABCD', 'status': 'RESERVED', 'distanceKm': 2.4, 'etaMin': 7,
        'reservedUntil': '2026-10-06T10:00:00.000Z', 'request': {'bloodType': 'A+', 'componentLabel': 'PRC'}, 'faskes': faskes,
      },
      'badges': [],
      'donations': [],
    });
    expect(d.invite!.request.compatibleOnly, isTrue);
    expect(d.invite!.request.deadline, isNotNull);
    expect(d.activeTicket!.qrPayload, 'BLOODSYNC:TKT-ABCD');
  });
}
