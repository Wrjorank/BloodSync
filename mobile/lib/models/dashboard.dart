// bentuk data GET /api/donors/me (lihat backend/src/services/donor.service.ts)

Map<String, dynamic>? _obj(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : null;
DateTime? _date(dynamic v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;
double _dbl(dynamic v) => v is num ? v.toDouble() : 0;
int _int(dynamic v) => v is num ? v.toInt() : 0;
String _str(dynamic v) => v == null ? '' : '$v';
List<String> _strings(dynamic v) => v is List ? v.map((e) => '$e').toList() : const [];

class Dashboard {
  Dashboard.fromJson(Map<String, dynamic> j)
      : profile = Profile.fromJson(_obj(j['profile'])!),
        eligibility = Eligibility.fromJson(_obj(j['eligibility'])!),
        reminder = _obj(j['reminder']) == null ? null : Reminder.fromJson(_obj(j['reminder'])!),
        // backend memakai `x && {...}`, jadi kosong bisa berupa null atau false
        invite = _obj(j['invite']) == null ? null : Invite.fromJson(_obj(j['invite'])!),
        activeTicket = _obj(j['activeTicket']) == null ? null : ActiveTicket.fromJson(_obj(j['activeTicket'])!),
        outcome = _obj(j['outcome']) == null ? null : Outcome.fromJson(_obj(j['outcome'])!),
        badges = (j['badges'] as List? ?? const []).map((b) => DonorBadge.fromJson(_obj(b)!)).toList(),
        donations = (j['donations'] as List? ?? const []).map((d) => Donation.fromJson(_obj(d)!)).toList();

  final Profile profile;
  final Eligibility eligibility;
  final Reminder? reminder;
  Invite? invite;
  final ActiveTicket? activeTicket;
  final Outcome? outcome;
  final List<DonorBadge> badges;
  final List<Donation> donations;
}

class Profile {
  Profile.fromJson(Map<String, dynamic> j)
      : id = _str(j['id']),
        name = _str(j['name']),
        phone = _str(j['phone']),
        bloodType = _str(j['bloodType']),
        area = _str(j['area']),
        isActive = j['isActive'] == true,
        lastDonationAt = _date(j['lastDonationAt']);

  final String id, name, phone, bloodType, area;
  final bool isActive;
  final DateTime? lastDonationAt;

  String get firstName => name.split(' ').first;
}

class Eligibility {
  Eligibility.fromJson(Map<String, dynamic> j)
      : eligible = j['eligible'] == true,
        nextDate = _date(j['nextDate']),
        daysLeft = _int(j['daysLeft']),
        cycleDays = _int(j['cycleDays']);

  final bool eligible;
  final DateTime? nextDate;
  final int daysLeft, cycleDays;
}

class Reminder {
  Reminder.fromJson(Map<String, dynamic> j)
      : message = _str(j['message']),
        lowStockText = _obj(j['lowStock']) == null ? null : _str(j['lowStock']['text']),
        lowStockKm = _obj(j['lowStock']) == null ? null : _dbl(j['lowStock']['distanceKm']);

  final String message;
  final String? lowStockText;
  final double? lowStockKm;
}

class Faskes {
  Faskes.fromJson(Map<String, dynamic> j)
      : name = _str(j['name']),
        area = _str(j['area']),
        mapsUrl = _str(j['mapsUrl']);

  final String name, area, mapsUrl;
}

class Invite {
  Invite.fromJson(Map<String, dynamic> j)
      : ticketId = _str(j['ticketId']),
        distanceKm = _dbl(j['distanceKm']),
        etaMin = _int(j['etaMin']),
        request = InviteRequest.fromJson(_obj(j['request'])!),
        faskes = Faskes.fromJson(_obj(j['faskes'])!);

  final String ticketId;
  final double distanceKm;
  final int etaMin;
  final InviteRequest request;
  final Faskes faskes;
}

class InviteRequest {
  InviteRequest.fromJson(Map<String, dynamic> j)
      : code = _str(j['code']),
        bloodType = _str(j['bloodType']),
        componentLabel = _str(j['componentLabel']),
        bagsNeeded = _int(j['bagsNeeded']),
        urgency = _str(j['urgency']),
        deadline = _date(j['deadline']),
        compatibleOnly = j['compatibleOnly'] == true;

  final String code, bloodType, componentLabel, urgency;
  final int bagsNeeded;
  final DateTime? deadline;
  final bool compatibleOnly;
}

class ActiveTicket {
  ActiveTicket.fromJson(Map<String, dynamic> j)
      : id = _str(j['id']),
        code = _str(j['code']),
        qrPayload = _str(j['qrPayload']),
        status = _str(j['status']),
        distanceKm = _dbl(j['distanceKm']),
        etaMin = _int(j['etaMin']),
        reservedUntil = _date(j['reservedUntil']),
        bloodType = _str(_obj(j['request'])?['bloodType']),
        componentLabel = _str(_obj(j['request'])?['componentLabel']),
        faskes = Faskes.fromJson(_obj(j['faskes'])!);

  final String id, code, qrPayload, status, bloodType, componentLabel;
  final double distanceKm;
  final int etaMin;
  final DateTime? reservedUntil;
  final Faskes faskes;
}

class Outcome {
  Outcome.fromJson(Map<String, dynamic> j)
      : ticketId = _str(j['ticketId']),
        status = _str(j['status']),
        note = j['note'] as String?,
        reasons = _strings(j['reasons']),
        newBadges = _strings(j['newBadges']),
        requestCode = _str(j['requestCode']),
        faskes = _str(j['faskes']);

  final String ticketId, status, requestCode, faskes;
  final String? note;
  final List<String> reasons, newBadges;
}

class DonorBadge {
  DonorBadge.fromJson(Map<String, dynamic> j)
      : id = _str(j['id']),
        label = _str(j['label']),
        icon = _str(j['icon']),
        earned = j['earned'] == true;

  final String id, label, icon;
  final bool earned;
}

class Donation {
  Donation.fromJson(Map<String, dynamic> j)
      : at = _date(j['at']),
        faskes = j['faskes'] as String?,
        component = _str(j['component']),
        requestCode = j['requestCode'] as String?;

  final DateTime? at;
  final String? faskes, requestCode;
  final String component;
}

class Meta {
  Meta.fromJson(Map<String, dynamic> j)
      : areas = _strings(j['areas']),
        maxAlertsPerWeek = _int(_obj(j['dispatch'])?['maxAlertsPerWeek']),
        devInbox = j['devInbox'] == true;

  final List<String> areas;
  final int maxAlertsPerWeek;
  final bool devInbox;
}
