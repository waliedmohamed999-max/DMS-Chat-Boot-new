import { Bot, Check, CircleCheck, MessagesSquare, Network, Send, Users } from "lucide-react";

/** Illustrative product scenes, using the parent site's visual language. */
export function FeatureVisual({ index }: { index: number }) {
  return (
    <div className="dms-feature-visual" aria-hidden="true">
      {index % 4 === 0 ? <div className="dms-mini-window"><div className="dms-mini-heading"><span className="dms-mini-icon"><Send size={14} /></span><b>حملة جديدة</b><span className="dms-mini-success">جاهزة للإرسال</span></div><div className="dms-mini-audience"><Users size={17} /><span>شريحة العملاء</span><span className="dms-mini-chip">محددة</span></div><div className="dms-mini-bars"><i /><i /><i /><i /><i /><i /></div><div className="dms-mini-footer"><span>تواصل في الوقت المناسب</span><CircleCheck size={13} /></div></div> :
      index % 4 === 1 ? <div className="dms-mini-window"><div className="dms-mini-heading"><span className="dms-mini-icon"><Bot size={14} /></span><b>DMS Bot</b><span className="dms-mini-success">رد تلقائي</span></div><div className="dms-mini-message">أحتاج تفاصيل الباقات</div><div className="dms-mini-message dms-mini-reply">أهلاً بك! كيف نقدر نساعدك؟</div><div className="dms-mini-options"><span>الباقات</span><span>تحدث مع الفريق</span></div></div> :
      index % 4 === 2 ? <div className="dms-mini-window"><div className="dms-mini-heading"><span className="dms-mini-icon"><MessagesSquare size={14} /></span><b>مساحة فريقك</b><span className="dms-mini-success">متصل</span></div><div className="dms-mini-contact"><i>س</i><div><b>سارة العتيبي</b><span>محادثة جديدة</span></div><Check size={14} /></div><div className="dms-mini-contact"><i>أ</i><div><b>أحمد الدوسري</b><span>تمت المتابعة</span></div><Check size={14} /></div><div className="dms-mini-footer">كل محادثاتك، في مكان واحد</div></div> :
      <div className="dms-mini-window"><div className="dms-mini-heading"><b>ربط الأنظمة</b><span className="dms-mini-success">متزامن</span></div><div className="dms-mini-network"><div><span>متجرك</span><span>العملاء</span></div><i><Network size={26} /></i><div><span>واتساب</span><span>الطلبات</span></div></div><div className="dms-mini-footer">بيانات واحدة لكل الفرق</div></div>}
    </div>
  );
}
