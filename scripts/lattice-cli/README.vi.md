# Lattice OS CLI

**0.3.1-rc.1 — bản ứng viên phát hành; bản ổn định chưa được phê duyệt.**

CLI quản lý việc triển khai Lattice OS bằng Docker trên hệ điều hành hiện có. Trang tải xuống của ứng dụng nằm tại `/downloads` và chỉ hiển thị gói sau khi nguồn gốc bản dựng cùng bằng chứng phát hành đã được kiểm tra.

## Cài đặt

Chọn tệp thực thi phù hợp với hệ điều hành và bộ xử lý. Tải `SHA256SUMS` để đối chiếu checksum. Trước khi chạy, hãy xác minh nguồn gốc bản dựng GitHub bằng commit nguồn đầy đủ hiển thị trên trang tải xuống:

```sh
gh attestation verify lattice-linux-amd64 --repo invidias-codem/ai-saas --signer-workflow invidias-codem/ai-saas/.github/workflows/build-lattice-cli.yml --source-ref refs/heads/main --source-digest <40-character-source-commit>
```

Hoặc tải và kiểm tra gói phát hành có phiên bản `install.sh` hoặc `install.ps1`, xác minh checksum và nguồn gốc rồi chạy với phiên bản và commit nguồn được chỉ định rõ:

```sh
bash install.sh cli-v0.3.1-rc.1 <40-character-source-commit>
```

```powershell
.\install.ps1 -Version cli-v0.3.1-rc.1 -SourceCommit <40-character-source-commit>
```

Trình cài đặt cần GitHub CLI và ghi vào thư mục do người dùng sở hữu mà không yêu cầu quyền quản trị. Thêm thư mục đó vào PATH nếu cần. Không tự động cài từ mã nguồn thay thế. Các gói chưa khả dụng cho đến khi bản ứng viên được dựng và xuất bản.

## Kiểm tra cài đặt

```sh
lattice --version
lattice doctor --offline --json
lattice doctor
```

Nhị phân đóng gói Python và thư viện mật mã. Lệnh triển khai cần Docker Engine với Compose v2 (hoặc Docker Desktop dùng container Linux). Kiểm tra ngoại tuyến chỉ xác nhận CLI, không chứng nhận bộ cài Docker đã triển khai đúng.

## Các lệnh

Chạy `lattice <group> --help` và `lattice <group> <command> --help` để xem tham số.

| Nhóm | Lệnh |
| --- | --- |
| auth | login, logout, status; cách tạo token cũ không phải cơ chế cấp quyền an toàn |
| deploy | init, start, stop, restart, status, shell |
| license | activate, deactivate, show |
| health | check, logs |
| upgrade | upgrade, rollback |
| backup | create, restore, list |
| org | status, members; tích hợp xác thực từ xa vẫn là trở ngại cho bản phát hành ổn định |
| task | run; yêu cầu thông tin xác thực API cục bộ hoặc của đối tác |
| doctor | --offline, --json |

Bản ứng viên này chỉ dùng đánh giá phát triển trong môi trường có thể xóa bỏ. Các vấn đề đã biết về giấy phép, xác thực tổ chức, xử lý thông tin xác thực và sao lưu nằm trong [mức độ sẵn sàng phát hành](../../docs/releases/cli-release-readiness.md). Không sử dụng để khôi phục production hoặc thực thi quyền sử dụng thương mại.

## Xây dựng và kiểm thử từ mã nguồn

Dùng Python 3.12 trong môi trường ảo:

```sh
python -m pip install --require-hashes -r scripts/lattice-cli/requirements-build.lock
python -m unittest discover -s scripts/lattice-cli/tests -v
python scripts/lattice-cli/build.py --pyinstaller
python scripts/lattice-cli/smoke_binary.py dist/cli/lattice-linux-amd64
```

Xây dựng riêng cho từng hệ điều hành và kiến trúc. Ma trận GitHub Actions hỗ trợ năm mục tiêu và chỉ tạo bản phát hành thử ở dạng nháp. PyInstaller đóng gói bytecode Python nhưng không bảo đảm bí mật sở hữu trí tuệ. Cài từ mã nguồn yêu cầu Python 3.11+ và gói phụ thuộc trong requirements.txt.
