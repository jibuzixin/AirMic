import Foundation
import Network

/// 一个已连接的手机端。
public final class ClientConnection {
    public let id: String
    public let connection: NWConnection
    private let onClose: () -> Void
    private var buffer = Data()
    private var closed = false

    /// 收到一条完整消息时回调
    public var onMessage: ((Message) -> Void)?

    init(id: String, connection: NWConnection, onClose: @escaping () -> Void) {
        self.id = id
        self.connection = connection
        self.onClose = onClose
        receive()
    }

    public var isClosed: Bool { closed }

    /// 发一条消息
    public func send(_ message: Message) {
        guard !closed else { return }
        let id = self.id
        do {
            let data = try JSONLines.encode(message)
            connection.send(content: data, completion: .contentProcessed { [weak self] error in
                if let error {
                    Log.error("发送失败（\(id)）：\(error.localizedDescription)")
                    self?.close()
                }
            })
        } catch {
            Log.error("消息编码失败：\(error.localizedDescription)")
        }
    }

    public func close() {
        guard !closed else { return }
        closed = true
        connection.cancel()
        onClose()
    }

    // MARK: - 收

    private func receive() {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            if let data, !data.isEmpty {
                self.buffer.append(data)
                self.drain()
            }
            if let error {
                Log.info("连接断开（\(self.id)）：\(error.localizedDescription)")
                self.close()
                return
            }
            if isComplete {
                self.close()
                return
            }
            self.receive()
        }
    }

    /// 从缓冲区里切出完整的 JSON 行
    private func drain() {
        while let newlineIndex = buffer.firstIndex(of: 0x0A) {
            let lineData = buffer[buffer.startIndex..<newlineIndex]
            buffer.removeSubrange(buffer.startIndex...newlineIndex)
            guard !lineData.isEmpty else { continue }
            do {
                let message = try JSONLines.decode(Data(lineData))
                onMessage?(message)
            } catch {
                Log.error("消息解析失败：\(error.localizedDescription)")
            }
        }
        if buffer.count > JSONLines.maxLineBytes {
            Log.error("单行消息超过上限，断开连接")
            close()
        }
    }
}

/// 控制通道服务端：TCP + JSON Lines，同时通过 Bonjour 广播 `_airmic._tcp`。
///
/// 一个 listener 同时干两件事：接连接 + 被手机端扫到。
public final class ControlServer {
    private var listener: NWListener?
    private var clients: [String: ClientConnection] = [:]
    private var clientCounter = 0

    /// 收到消息时回调
    public var onMessage: ((Message, ClientConnection) -> Void)?
    /// 有客户端接入 / 断开时回调
    public var onClientChange: ((Bool) -> Void)?

    private let serviceName: String
    private var txtRecord: [String: String]

    /// 默认端口：47471（「AIRM」的字母位）。用固定端口方便开发期工具直连。
    public static let defaultPort: UInt16 = 47471

    private let listenPort: NWEndpoint.Port

    public init(serviceName: String, txtRecord: [String: String], port: UInt16 = ControlServer.defaultPort) {
        self.serviceName = serviceName
        self.txtRecord = txtRecord
        self.listenPort = NWEndpoint.Port(rawValue: port) ?? .any
    }

    /// 更新 Bonjour TXT 记录（状态变化时调用，比如开始收音）
    public func setTXTRecord(_ record: [String: String]) {
        txtRecord = record
        listener?.service = NWListener.Service(
            name: serviceName,
            type: "_airmic._tcp",
            domain: nil,
            txtRecord: NWTXTRecord(record)
        )
    }

    /// 实际监听端口（.any = 随机分配）
    private(set) var port: NWEndpoint.Port = .any

    public func start() throws {
        let parameters = NWParameters.tcp
        parameters.allowLocalEndpointReuse = true
        parameters.includePeerToPeer = true

        let nwListener = try NWListener(using: parameters, on: listenPort)
        nwListener.service = NWListener.Service(
            name: serviceName,
            type: "_airmic._tcp",
            domain: nil,
            txtRecord: NWTXTRecord(txtRecord)
        )
        nwListener.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                guard let self, let port = nwListener.port else { return }
                self.port = port
                Log.info("控制通道已就绪，端口 \(self.port)，Bonjour 类型 _airmic._tcp")
            case .failed(let error):
                Log.error("监听失败：\(error.localizedDescription)")
            case .cancelled:
                Log.info("控制通道已关闭")
            default:
                break
            }
        }
        nwListener.newConnectionHandler = { [weak self] connection in
            self?.accept(connection)
        }
        nwListener.start(queue: .global(qos: .userInitiated))
        self.listener = nwListener
    }

    public func stop() {
        for client in clients.values { client.close() }
        clients.removeAll()
        listener?.cancel()
        listener = nil
    }

    /// 广播给所有手机端
    public func broadcast(_ message: Message) {
        for client in clients.values {
            client.send(message)
        }
    }

    private func accept(_ connection: NWConnection) {
        clientCounter += 1
        let id = "c\(clientCounter)"
        let client = ClientConnection(id: id, connection: connection) { [weak self] in
            guard let self else { return }
            self.clients.removeValue(forKey: id)
            self.onClientChange?(false)
        }
        client.onMessage = { [weak self] message in
            self?.onMessage?(message, client)
        }
        clients[id] = client
        connection.stateUpdateHandler = { state in
            if case .failed = state {
                client.close()
            }
        }
        connection.start(queue: .global(qos: .userInitiated))
        Log.info("手机端已接入：\(id)")
        onClientChange?(true)
    }
}
