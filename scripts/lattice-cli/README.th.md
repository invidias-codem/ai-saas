# Lattice OS CLI

**0.3.1-rc.1 — รุ่นเตรียมเผยแพร่; ยังไม่อนุมัติรุ่นเสถียร**

CLI ใช้จัดการการติดตั้ง Lattice OS ผ่าน Docker บนระบบปฏิบัติการที่ใช้อยู่ หน้าดาวน์โหลดของแอปอยู่ที่ `/downloads` และจะแสดงไฟล์เมื่อผ่านการตรวจสอบที่มาของการสร้างและหลักฐานการเผยแพร่แล้วเท่านั้น

## การติดตั้ง

เลือกไฟล์ให้ตรงกับระบบปฏิบัติการและหน่วยประมวลผล ดาวน์โหลด `SHA256SUMS` แล้วเทียบค่า checksum ก่อนเรียกใช้โปรแกรม ให้ตรวจสอบที่มาของ GitHub build โดยใช้ commit ต้นทางแบบเต็มที่แสดงในหน้าดาวน์โหลด:

```sh
gh attestation verify lattice-linux-amd64 --repo invidias-codem/ai-saas --signer-workflow invidias-codem/ai-saas/.github/workflows/build-lattice-cli.yml --source-ref refs/heads/main --source-digest <40-character-source-commit>
```

หรือดาวน์โหลดและตรวจสอบไฟล์เผยแพร่ที่ระบุเวอร์ชัน `install.sh` หรือ `install.ps1` ตรวจสอบ checksum และที่มา แล้วเรียกใช้โดยระบุเวอร์ชันและ commit ต้นทางอย่างชัดเจน:

```sh
bash install.sh cli-v0.3.1-rc.1 <40-character-source-commit>
```

```powershell
.\install.ps1 -Version cli-v0.3.1-rc.1 -SourceCommit <40-character-source-commit>
```

ตัวติดตั้งต้องใช้ GitHub CLI และลงในโฟลเดอร์ของผู้ใช้โดยไม่ต้องขอสิทธิ์ผู้ดูแลระบบ เพิ่มโฟลเดอร์ลงใน PATH หากจำเป็น จะไม่มีการติดตั้งจากซอร์สโค้ดแทนโดยอัตโนมัติ ไฟล์จะยังไม่พร้อมใช้จนกว่าจะสร้างและเผยแพร่รุ่นเตรียมเผยแพร่

## ตรวจสอบการติดตั้ง

```sh
lattice --version
lattice doctor --offline --json
lattice doctor
```

ไบนารีรวม Python และไลบรารีเข้ารหัสแล้ว คำสั่งติดตั้งต้องใช้ Docker Engine พร้อม Compose v2 (หรือ Docker Desktop ที่ใช้คอนเทนเนอร์ Linux) การตรวจสอบแบบออฟไลน์ยืนยันเฉพาะ CLI ไม่ได้รับรองว่าติดตั้ง Docker appliance สำเร็จ

## คำสั่ง

ใช้ `lattice <group> --help` และ `lattice <group> <command> --help` เพื่อดูอาร์กิวเมนต์

| กลุ่ม | คำสั่ง |
| --- | --- |
| auth | login, logout, status; การสร้างโทเค็นแบบเดิมไม่ใช่ระบบจัดการสิทธิ์ที่ปลอดภัย |
| deploy | init, start, stop, restart, status, shell |
| license | activate, deactivate, show |
| health | check, logs |
| upgrade | upgrade, rollback |
| backup | create, restore, list |
| org | status, members; การเชื่อมระบบยืนยันตัวตนระยะไกลยังเป็นอุปสรรคต่อการออกเวอร์ชันเสถียร |
| task | run; ต้องใช้ข้อมูลรับรอง API ในเครื่องหรือของพันธมิตร |
| doctor | --offline, --json |

รุ่นนี้มีไว้สำหรับทดสอบการพัฒนาในสภาพแวดล้อมที่ลบทิ้งได้เท่านั้น ปัญหาที่ทราบเรื่องใบอนุญาต การยืนยันตัวตนองค์กร ข้อมูลรับรอง และการสำรองข้อมูลอยู่ใน [ความพร้อมก่อนเผยแพร่](../../docs/releases/cli-release-readiness.md) อย่าใช้กู้คืนระบบ production หรือบังคับใช้สิทธิ์เชิงพาณิชย์

## สร้างและทดสอบจากซอร์สโค้ด

ใช้ Python 3.12 ภายในสภาพแวดล้อมเสมือน:

```sh
python -m pip install --require-hashes -r scripts/lattice-cli/requirements-build.lock
python -m unittest discover -s scripts/lattice-cli/tests -v
python scripts/lattice-cli/build.py --pyinstaller
python scripts/lattice-cli/smoke_binary.py dist/cli/lattice-linux-amd64
```

สร้างไบนารีสำหรับแต่ละระบบปฏิบัติการและสถาปัตยกรรม เมทริกซ์ GitHub Actions รองรับห้าเป้าหมายและเตรียมเพียงร่างเวอร์ชันก่อนเผยแพร่ PyInstaller รวม bytecode ของ Python แต่ไม่ได้ป้องกันการเข้าถึงทรัพย์สินทางปัญญา การติดตั้งจากซอร์สต้องใช้ Python 3.11+ และ dependency ใน requirements.txt
