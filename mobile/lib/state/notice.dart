enum NoticeKind { info, success, error }

class Notice {
  const Notice(this.text, [this.kind = NoticeKind.info]);
  final String text;
  final NoticeKind kind;
}
