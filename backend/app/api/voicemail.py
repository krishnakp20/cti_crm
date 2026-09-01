import os
import configparser
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User, UserRole

router = APIRouter(prefix="/voicemail", tags=["voicemail"])

VM_BASE = Path(os.getenv("VOICEMAIL_PATH", "/var/spool/asterisk/voicemail/default"))

# Map agent extension → mailbox folder
def _mailbox_path(extension: str) -> Path:
    return VM_BASE / extension

def _parse_txt(txt_path: Path) -> dict:
    """Parse Asterisk voicemail .txt metadata file."""
    cfg = configparser.ConfigParser()
    try:
        cfg.read(txt_path)
        msg = dict(cfg["message"]) if "message" in cfg else {}
    except Exception:
        msg = {}
    return msg

def _list_messages(ext: str, folder: str = "INBOX") -> list:
    path = _mailbox_path(ext) / folder
    if not path.exists():
        return []
    messages = []
    for wav in sorted(path.glob("msg*.WAV")):
        stem = wav.stem  # e.g. msg0000
        txt = path / f"{stem}.txt"
        meta = _parse_txt(txt) if txt.exists() else {}
        callerid = meta.get("callerid", "Unknown")
        # Parse "Name <number>" format
        caller_num = callerid
        if "<" in callerid:
            caller_num = callerid.split("<")[-1].rstrip(">")
        duration = int(meta.get("duration", 0))
        origtime = meta.get("origtime")
        dt = datetime.fromtimestamp(int(origtime)).isoformat() if origtime else None
        messages.append({
            "id": f"{ext}_{folder}_{stem}",
            "extension": ext,
            "folder": folder,
            "filename": stem,
            "caller_id": caller_num,
            "caller_name": meta.get("callerchan", ""),
            "duration": duration,
            "timestamp": dt,
            "wav_path": str(wav),
        })
    return messages


@router.get("")
async def list_voicemails(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List voicemail messages. Agents see own mailbox; admins/clients see all."""
    from app.models.user import User as UserModel
    from sqlalchemy import select

    if current_user.role == UserRole.AGENT:
        if not current_user.extension:
            return {"items": [], "total": 0}
        messages = _list_messages(current_user.extension)
        return {"items": messages, "total": len(messages)}

    # Admin/client — get all agents for this client
    q = select(UserModel).where(
        UserModel.client_id == current_user.client_id,
        UserModel.extension.isnot(None),
    )
    if current_user.role == UserRole.ADMIN:
        q = select(UserModel).where(UserModel.extension.isnot(None))
    result = await db.execute(q)
    agents = result.scalars().all()

    all_messages = []
    for agent in agents:
        msgs = _list_messages(agent.extension)
        for m in msgs:
            m["agent_name"] = agent.full_name
            m["agent_extension"] = agent.extension
        all_messages.extend(msgs)

    # Sort newest first
    all_messages.sort(key=lambda x: x["timestamp"] or "", reverse=True)
    return {"items": all_messages, "total": len(all_messages)}


@router.get("/play/{msg_id}")
async def play_voicemail(
    msg_id: str,
    current_user: User = Depends(get_current_user),
):
    """Stream a voicemail WAV file. msg_id = {ext}_{folder}_{stem}"""
    parts = msg_id.split("_", 2)
    if len(parts) != 3:
        raise HTTPException(status_code=400, detail="Invalid message id")
    ext, folder, stem = parts

    # Agents can only access their own mailbox
    if current_user.role == UserRole.AGENT and current_user.extension != ext:
        raise HTTPException(status_code=403, detail="Access denied")

    wav = _mailbox_path(ext) / folder / f"{stem}.WAV"
    if not wav.exists():
        raise HTTPException(status_code=404, detail="Voicemail not found")

    return FileResponse(str(wav), media_type="audio/wav", filename=f"{msg_id}.wav")


@router.delete("/{msg_id}")
async def delete_voicemail(
    msg_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete a voicemail message."""
    parts = msg_id.split("_", 2)
    if len(parts) != 3:
        raise HTTPException(status_code=400, detail="Invalid message id")
    ext, folder, stem = parts

    if current_user.role == UserRole.AGENT and current_user.extension != ext:
        raise HTTPException(status_code=403, detail="Access denied")

    path = _mailbox_path(ext) / folder
    for suffix in [".WAV", ".wav", ".gsm", ".txt"]:
        f = path / f"{stem}{suffix}"
        if f.exists():
            f.unlink()

    return {"ok": True}
