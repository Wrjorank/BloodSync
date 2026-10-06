const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const componentLabel = {'PRC': 'PRC', 'TC': 'Trombosit', 'WB': 'Whole Blood'};
const urgencyLabel = {'KRITIS': 'Kritis', 'MENDESAK': 'Mendesak', 'TERJADWAL': 'Terjadwal'};

String _two(int n) => n.toString().padLeft(2, '0');

String fmtDate(DateTime? d) => d == null ? '—' : '${d.day} ${_months[d.month - 1]} ${d.year}';

String fmtTime(DateTime? d) => d == null ? '—' : '${_two(d.hour)}.${_two(d.minute)}';

String fmtKm(double km) => '${km.toStringAsFixed(1).replaceAll('.', ',')} km';

String fmtDuration(Duration left) {
  if (left.isNegative) return 'habis';
  final h = left.inHours;
  if (h > 0) return '${h}j ${_two(left.inMinutes % 60)}m';
  return '${_two(left.inMinutes)}:${_two(left.inSeconds % 60)}';
}

String isoDay(DateTime d) => '${d.year}-${_two(d.month)}-${_two(d.day)}';
